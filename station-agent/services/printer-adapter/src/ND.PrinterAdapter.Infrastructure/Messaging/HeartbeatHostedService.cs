using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Application.Interfaces;
using ND.PrinterAdapter.Infrastructure.Persistence;
using ND.PrinterAdapter.Domain.Entities;
using ND.UnifiedContracts.Events;

namespace ND.PrinterAdapter.Infrastructure.Messaging;

/// <summary>
/// Polls all printer health every 3 seconds and publishes DeviceStatusHeartbeat to Kafka.
///
/// For CUPS printers: delegates to <see cref="IPrinterDriverFactory"/> → <see cref="CupsPrinterDriver"/>
///   → <see cref="ICupsPrinterStateAggregator"/> → CUPS IPP API (real hardware state).
///   The richer lifecycleState (Online|Busy|Printing|Waiting|Warning|Offline|Error) is included
///   in the heartbeat so Projection Service and Kiosk UI can render full state detail.
///
/// For simulation printers: TCP ping to the virtual simulator listener.
///
/// Projection Service must never communicate with CUPS or the OS directly.
/// All hardware interpretation lives exclusively inside Printer Adapter.
/// </summary>
public sealed class HeartbeatHostedService : BackgroundService
{
    private readonly IServiceScopeFactory    _scopeFactory;
    private readonly IPrinterDriverFactory   _driverFactory;
    private readonly IPrinterEventBus         _publisher;
    private readonly KafkaOptions              _kafkaOptions;
    private readonly ILogger<HeartbeatHostedService> _logger;

    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(3);

    // States considered "online" for the isOnline boolean flag in the heartbeat
    private static readonly HashSet<PrinterDriverStatus> OnlineStates = new()
    {
        PrinterDriverStatus.Online,
        PrinterDriverStatus.Busy,
        PrinterDriverStatus.Printing,
        PrinterDriverStatus.Waiting,
        PrinterDriverStatus.Warning,
        PrinterDriverStatus.Connecting,
        PrinterDriverStatus.PaperOut,
        PrinterDriverStatus.RibbonOut,
        PrinterDriverStatus.HeadOpen,
        PrinterDriverStatus.BufferFull,
        PrinterDriverStatus.ThermalWarning
    };

    public HeartbeatHostedService(
        IServiceScopeFactory    scopeFactory,
        IPrinterDriverFactory   driverFactory,
        IPrinterEventBus         publisher,
        Microsoft.Extensions.Options.IOptions<KafkaOptions> kafkaOptions,
        ILogger<HeartbeatHostedService> logger)
    {
        _scopeFactory  = scopeFactory;
        _driverFactory = driverFactory;
        _publisher     = publisher;
        _kafkaOptions  = kafkaOptions.Value;
        _logger        = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Printer Adapter Heartbeat Background Service started (poll every {Interval}s).", PollInterval.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PublishAllPrinterHeartbeatsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Printer Adapter heartbeat publisher.");
            }

            await Task.Delay(PollInterval, stoppingToken);
        }
    }

    private async Task PublishAllPrinterHeartbeatsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db          = scope.ServiceProvider.GetRequiredService<PrinterDbContext>();
        await ReconcileCupsQueuesAsync(db, ct);
        var printers    = await db.Printers.ToListAsync(ct);

        foreach (var printer in printers)
        {
            try
            {
                var driver = _driverFactory.Resolve(printer);
                var status = await driver.GetStatusAsync(ct);
                var maintenanceInfo = await driver.GetMaintenanceInfoAsync(ct);

                bool   isOnline      = OnlineStates.Contains(status);
                string lifecycleState = status switch
                {
                    PrinterDriverStatus.Online      => "Online",
                    PrinterDriverStatus.Busy        => "Busy",
                    PrinterDriverStatus.Printing    => "Printing",
                    PrinterDriverStatus.Waiting     => "Waiting",
                    PrinterDriverStatus.Warning     => "Warning",
                    PrinterDriverStatus.Connecting  => "Connecting",
                    PrinterDriverStatus.Offline     => "Offline",
                    PrinterDriverStatus.Error       => "Error",
                    PrinterDriverStatus.Stopped     => "Error",
                    PrinterDriverStatus.Disconnected => "Offline",
                    PrinterDriverStatus.PaperOut    => "Paper Out",
                    PrinterDriverStatus.RibbonOut   => "Ribbon Out",
                    PrinterDriverStatus.HeadOpen    => "Head Open",
                    PrinterDriverStatus.BufferFull  => "Buffer Full",
                    PrinterDriverStatus.ThermalWarning => "Thermal Warning",
                    _                               => "Unknown",
                };

                // Update local database status
                var newStatus = isOnline ? "ONLINE" : "OFFLINE";
                if (printer.Status != newStatus)
                    printer.UpdateStatus(newStatus);

                var hb = new DeviceStatusHeartbeat(
                    printer.PrinterCode,
                    "Printer",
                    isOnline,
                    lifecycleState,
                    DateTime.UtcNow.ToString("o"),
                    SerialNumber: maintenanceInfo?.SerialNumber,
                    LifetimePrintCounter: maintenanceInfo?.LifetimePrintLength,
                    ThermalTemp: maintenanceInfo?.CurrentTemperature,
                    ConnectionDetails: $"{printer.IpAddress}:{printer.Port}"
                );

                await _publisher.PublishAsync(_kafkaOptions.DeviceHeartbeatsTopic, printer.PrinterCode, JsonSerializer.Serialize(hb), ct);
                _logger.LogDebug("Heartbeat [{Code}] → {LifecycleState} (isOnline={Online}, Temp={Temp}, SN={SN})",
                    printer.PrinterCode, lifecycleState, isOnline, maintenanceInfo?.CurrentTemperature, maintenanceInfo?.SerialNumber);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Heartbeat failed for printer {Code}", printer.PrinterCode);
            }
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task ReconcileCupsQueuesAsync(PrinterDbContext db, CancellationToken ct)
    {
        try
        {
            var cupsDriver = _driverFactory.ResolveByType("cups");
            var discovered = await cupsDriver.DiscoverAsync(ct);
            var host = Environment.GetEnvironmentVariable("CUPS_HEALTH_HOST") ?? "host.docker.internal";

            foreach (var device in discovered.Where(item => !string.IsNullOrWhiteSpace(item.QueueName)))
            {
                var queue = device.QueueName!;
                var canonicalCode = queue switch
                {
                    "Brother_DCP_B7535DW_series" => "Brother-DCP-B7535DW-CUPS",
                    "Zebra_Technologies_ZTC_GK420t" => "Zebra-GK420t-CUPS",
                    _ => string.Empty
                };
                var printer = !string.IsNullOrWhiteSpace(canonicalCode)
                    ? await db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == canonicalCode, ct)
                    : await db.Printers.FirstOrDefaultAsync(p => p.DriverType == "cups" && p.CupsQueueName == queue, ct);
                if (printer is null)
                {
                    var code = "CUPS-" + SanitizeCode(queue);
                    var suffix = 2;
                    while (await db.Printers.AnyAsync(p => p.PrinterCode == code, ct)) code = $"CUPS-{SanitizeCode(queue)}-{suffix++}";
                    var vendor = InferVendor(device.Name, queue);
                    printer = Printer.Create(code, device.Name, host, 631, "ZPL", vendor, driverType: "cups", cupsQueueName: queue);
                    printer.UpdateDiscoveredCups(device.Name, host, queue, vendor);
                    await db.Printers.AddAsync(printer, ct);
                    _logger.LogInformation("[CUPS] registered queue={Queue} printerCode={Code}; persisted assignments are retained", queue, code);
                }
                else
                {
                    printer.UpdateDiscoveredCups(device.Name, host, queue, InferVendor(device.Name, queue));
                }
            }
        }
        catch (Exception ex)
        {
            // A discovery outage must never delete or deactivate persisted rows.
            _logger.LogWarning(ex, "[CUPS] discovery failed; retaining registered printers and template assignments");
        }
    }

    private static string SanitizeCode(string queue)
    {
        var code = new string(queue.ToUpperInvariant().Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray()).Trim('-');
        return string.IsNullOrWhiteSpace(code) ? "PRINTER" : code;
    }

    private static string InferVendor(string displayName, string queue)
    {
        var value = $"{displayName} {queue}";
        return value.Contains("BROTHER", StringComparison.OrdinalIgnoreCase)
            ? "BROTHER"
            : value.Contains("ZEBRA", StringComparison.OrdinalIgnoreCase)
                ? "ZEBRA"
                : "OTHER";
    }
}
