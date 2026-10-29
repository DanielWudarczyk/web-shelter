namespace WebShelter.API.Models
{
    public class AdoptionApplication
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public User User { get; set; } = null!;
        public int PetId { get; set; }
        public Pet Pet { get; set; } = null!;
        public string Content { get; set; } = string.Empty;
        public string Status { get; set; } = "oczekujące";
    }
}