namespace WebShelter.API.Models
{
    public class PetImage
    {
        public int Id { get; set; }
        public string Url { get; set; } = string.Empty;
        public bool IsMain { get; set; } = false;

        public int PetId { get; set; }
        public Pet Pet { get; set; } = null!;
    }
}