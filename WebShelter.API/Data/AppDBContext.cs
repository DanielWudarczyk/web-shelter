using Microsoft.EntityFrameworkCore;
using WebShelter.API.Models;

namespace WebShelter.API.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<User> Users => Set<User>();
        public DbSet<Pet> Pets => Set<Pet>();
        public DbSet<AdoptionApplication> AdoptionApplications => Set<AdoptionApplication>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Relacja użytkownik - zgłoszenie adopcyjne
            modelBuilder.Entity<AdoptionApplication>()
                .HasOne(a => a.User)
                .WithMany()
                .HasForeignKey(a => a.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Relacja zwierzę - zgłoszenie adopcyjne
            modelBuilder.Entity<AdoptionApplication>()
                .HasOne(a => a.Pet)
                .WithMany()
                .HasForeignKey(a => a.PetId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}