namespace WebShelter.API.Models
{
    public class Pet
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Species { get; set; } = string.Empty;
        public string Breed { get; set; } = string.Empty;
        public int AgeInMonths { get; set; }
        public string Description { get; set; } = string.Empty;
        public string Status { get; set; } = "dostepny";

        public ICollection<PetImage> Images { get; set; } = new List<PetImage>();
    }
}