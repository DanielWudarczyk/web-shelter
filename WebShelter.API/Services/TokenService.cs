using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using WebShelter.API.Models;
namespace WebShelter.API.Services;
public class TokenService(IConfiguration configuration)
{
    public string Create(User user)
    {
        var key = configuration["Jwt:Key"] ?? throw new InvalidOperationException("Ustaw Jwt:Key (minimum 32 znaki).");
        if (Encoding.UTF8.GetByteCount(key) < 32) throw new InvalidOperationException("Jwt:Key musi mieć minimum 32 bajty.");
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
        var claims = new[] { new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Email, user.Email), new Claim(ClaimTypes.Role, user.Role) };
        var token = new JwtSecurityToken(issuer: configuration["Jwt:Issuer"], audience: configuration["Jwt:Audience"],
            claims: claims, expires: DateTime.UtcNow.AddHours(8), signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
