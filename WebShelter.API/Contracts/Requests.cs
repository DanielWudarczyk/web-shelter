using System.ComponentModel.DataAnnotations;
namespace WebShelter.API.Contracts;

public record RegisterRequest([Required, EmailAddress] string Email, [Required, MinLength(8)] string Password,
    [Required, MaxLength(100)] string FirstName, [Required, MaxLength(100)] string LastName);
public record LoginRequest([Required, EmailAddress] string Email, [Required] string Password);
public record AnimalRequest([Required, MaxLength(120)] string Name, [Required] string Species, [Range(0, 60)] int Age,
    [Required] string Gender, [Required] string Description, string? Traits, string? PhotoUrl, bool IsAvailable,
    string? Breed = null);
public record ApplicationRequest(int AnimalId, [Required] string Phone, [Required] string HomeType, bool HasGarden,
    [Required, MinLength(10)] string Reason);
public record StatusRequest([Required] string Status);
