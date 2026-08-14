using ND.SharedKernel.Primitives;

namespace ND.PrinterAdapter.Domain.Entities;

/// <summary>Persistent layout-only settings for the WMS CODE128 barcode.</summary>
public sealed class WmsBarcodeStyle : Entity
{
    public double WidthMm { get; private set; } = 100;
    public double HeightMm { get; private set; } = 50;
    public double XMm { get; private set; } = 5;
    public double YMm { get; private set; } = 5;
    public string UpdatedAt { get; private set; } = DateTime.UtcNow.ToString("o");

    private WmsBarcodeStyle() { }

    public static WmsBarcodeStyle CreateDefault() => new();

    public void Update(double widthMm, double heightMm, double xMm, double yMm)
    {
        WidthMm = widthMm;
        HeightMm = heightMm;
        XMm = xMm;
        YMm = yMm;
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }
}
