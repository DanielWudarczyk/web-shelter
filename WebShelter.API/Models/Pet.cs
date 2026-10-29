namespace WebShelter.API.Models;
public class Pet
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Species { get; set; } = "";
    public string Breed { get; set; } = "";
    public int AgeInMonths { get; set; }
    public string Gender { get; set; } = "";
    public string Description { get; set; } = "";
    public string Traits { get; set; } = "";
    public string Status { get; set; } = "Available";
    public ICollection<PetImage> Images { get; set; } = new List<PetImage>();
}
