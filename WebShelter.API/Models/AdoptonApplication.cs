namespace WebShelter.API.Models;
public class AdoptionApplication
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public int PetId { get; set; }
    public Pet Pet { get; set; } = null!;
    public string Content { get; set; } = "";
    public string Phone { get; set; } = "";
    public string HomeType { get; set; } = "";
    public bool HasGarden { get; set; }
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "Pending";
}
