using Microsoft.EntityFrameworkCore;
using WebShelter.API.Models;

namespace WebShelter.API.Data;
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Pet> Pets => Set<Pet>();
    public DbSet<PetImage> PetImages => Set<PetImage>();
    public DbSet<AdoptionApplication> AdoptionApplications => Set<AdoptionApplication>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<User>().Property(u => u.Email).HasMaxLength(254);
        modelBuilder.Entity<User>().Property(u => u.Role).HasMaxLength(16);
        modelBuilder.Entity<Pet>().Property(p => p.Name).HasMaxLength(120);
        modelBuilder.Entity<Pet>().Property(p => p.Species).HasMaxLength(40);
        modelBuilder.Entity<Pet>().Property(p => p.Status).HasMaxLength(30);
        modelBuilder.Entity<PetImage>().HasOne(i => i.Pet).WithMany(p => p.Images).HasForeignKey(i => i.PetId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<AdoptionApplication>().HasOne(a => a.User).WithMany().HasForeignKey(a => a.UserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<AdoptionApplication>().HasOne(a => a.Pet).WithMany().HasForeignKey(a => a.PetId).OnDelete(DeleteBehavior.Restrict);
    }
}
