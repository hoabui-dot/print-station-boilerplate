using System.Threading;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ND.PrinterAdapter.Domain.Entities;
using ND.PrinterAdapter.Infrastructure.Persistence;

namespace ND.PrinterAdapter.Infrastructure.DeviceAdapters;

/// <summary>Stable round-robin selection across currently online CUPS printers.</summary>
public sealed class RoundRobinPrinterSelector
{
    private int _cursor = -1;
    private readonly ILogger<RoundRobinPrinterSelector> _logger;

    public RoundRobinPrinterSelector(ILogger<RoundRobinPrinterSelector> logger) => _logger = logger;

    public async Task<Printer?> SelectAsync(PrinterDbContext db, string? requestedCode, CancellationToken ct)
    {
        var requested = requestedCode?.Trim();
        if (!string.IsNullOrWhiteSpace(requested) && !string.Equals(requested, "Printer-01", StringComparison.OrdinalIgnoreCase))
        {
            var explicitPrinter = await db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == requested && p.DriverType == "cups" && p.IsActiveForWork && IsOnline(p.Status), ct);
            if (explicitPrinter is not null) return explicitPrinter;
        }

        var candidates = await db.Printers
            .Where(p => p.DriverType == "cups" && p.IsActiveForWork && (p.Status == "ONLINE" || p.Status == "IDLE" || p.Status == "Online" || p.Status == "Idle"))
            .OrderBy(p => p.PrinterCode)
            .ToListAsync(ct);
        if (candidates.Count == 0) return null;

        var index = (int)((uint)Interlocked.Increment(ref _cursor) % (uint)candidates.Count);
        var selected = candidates[index];
        _logger.LogInformation("[PrinterRouting] round_robin selected={PrinterCode} candidates={Candidates}", selected.PrinterCode, string.Join(',', candidates.Select(p => p.PrinterCode)));
        return selected;
    }

    private static bool IsOnline(string status) => status is "ONLINE" or "IDLE" or "Online" or "Idle";
}
