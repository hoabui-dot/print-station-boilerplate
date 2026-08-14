using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using ND.KioskUi.Application.Interfaces;
using ND.KioskUi.Application.Options;
using ND.KioskUi.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.KioskUi.Application.Commands;

public record LoginCommand(string Username, string Password, string IpAddress, string UserAgent);
public record LoginResult(string Token, string UserId, string Username, string FullName, string ExpiresAt);

public sealed class LoginHandler
{
    private readonly IKioskUserRepository _users;
    private readonly IKioskSessionRepository _sessions;
    private readonly IKioskAccessLogRepository _accessLogs;
    private readonly IKioskRbacRepository _rbac;
    private readonly IUnitOfWork _unitOfWork;
    private readonly JwtOptions _jwt;
    private readonly ILogger<LoginHandler> _logger;

    public LoginHandler(IKioskUserRepository users, IKioskSessionRepository sessions,
        IKioskAccessLogRepository accessLogs, IKioskRbacRepository rbac, IUnitOfWork unitOfWork,
        IOptions<JwtOptions> jwt, ILogger<LoginHandler> logger)
    {
        _users = users;
        _sessions = sessions;
        _accessLogs = accessLogs;
        _rbac = rbac;
        _unitOfWork = unitOfWork;
        _jwt = jwt.Value;
        _logger = logger;
    }

    public async Task<LoginResult?> HandleAsync(LoginCommand command, CancellationToken ct = default)
    {
        var user = await _users.GetByUsernameAsync(command.Username, ct);
        if (user is null || !user.IsActive || !BCrypt.Net.BCrypt.Verify(command.Password, user.PasswordHash))
        {
            _logger.LogWarning("Failed local login attempt for {Username}", command.Username);
            return null;
        }

        var roles = await _rbac.GetUserRolesAsync(user.Id, ct);
        var permissions = await _rbac.GetUserPermissionsAsync(user.Id, ct);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.UniqueName, user.Username),
            new("fullName", user.FullName)
        };
        claims.AddRange(roles.Select(x => new Claim("role", x)));
        claims.AddRange(permissions.Select(x => new Claim("permission", x)));
        var expires = DateTime.UtcNow.AddMinutes(_jwt.ExpiryMinutes);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Secret));
        var token = new JwtSecurityToken(_jwt.Issuer, _jwt.Audience, claims, expires: expires,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        var tokenText = new JwtSecurityTokenHandler().WriteToken(token);
        var session = KioskSession.Create(user.Id, tokenText, command.IpAddress, command.UserAgent, _jwt.ExpiryMinutes);
        await _sessions.AddAsync(session, ct);
        await _accessLogs.AddAsync(KioskAccessLog.Create(user.Id, session.Id, "LOGIN", "USER", user.Id, "SUCCESS"), ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new LoginResult(tokenText, user.Id, user.Username, user.FullName, session.ExpiresAt);
    }
}
