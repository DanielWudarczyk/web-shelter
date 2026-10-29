using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using WebShelter.API.Contracts;
using WebShelter.API.Data;
using WebShelter.API.Models;
using WebShelter.API.Services;

var builder = WebApplication.CreateBuilder(args);
var key = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(key) || Encoding.UTF8.GetByteCount(key) < 32)
    throw new InvalidOperationException("Skonfiguruj Jwt:Key (co najmniej 32 bajty) przez zmienną Jwt__Key lub user-secrets.");

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("Brak ConnectionStrings:DefaultConnection. Ustaw NEON_CONNECTION_STRING w .env dla Dockera lub ConnectionStrings__DefaultConnection / user-secrets dla dotnet run.");
// Neon.tech wymaga szyfrowanego połączenia TLS. Nie przechowuj hasła w appsettings.json.
builder.Services.AddDbContext<AppDbContext>(opt => opt.UseNpgsql(connectionString));
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => o.TokenValidationParameters = new TokenValidationParameters {
        ValidateIssuer = true, ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidateAudience = true, ValidAudience = builder.Configuration["Jwt:Audience"],
        ValidateLifetime = true, ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
        ClockSkew = TimeSpan.FromMinutes(1)
    });
builder.Services.AddAuthorization(o => o.AddPolicy("admin", policy => policy.RequireRole("admin")));
builder.Services.AddCors(opt => opt.AddPolicy("frontend", p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"])
    .AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddOpenApi();
var app = builder.Build();
app.UseCors("frontend");
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
if (app.Environment.IsDevelopment()) app.MapOpenApi();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

// Baza Neon: EnsureCreated tylko dla nowej, pustej bazy. Istniejących tabel nie modyfikujemy automatycznie.
using (var scope = app.Services.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (app.Configuration.GetValue("Database:EnsureCreated", true)) await db.Database.EnsureCreatedAsync();
    var adminEmail = app.Configuration["SeedAdmin:Email"]?.Trim().ToLowerInvariant();
    var adminPassword = app.Configuration["SeedAdmin:Password"];
    if (!string.IsNullOrEmpty(adminEmail) && !string.IsNullOrEmpty(adminPassword)) {
        if (adminPassword.Length < 8) throw new InvalidOperationException("Hasło administratora musi mieć min. 8 znaków.");
        if (!await db.Users.AnyAsync(u => u.Email == adminEmail)) {
            var admin = new User { Email = adminEmail, FirstName = "Administrator", LastName = "Schroniska", Role = "admin" };
            admin.PasswordHash = scope.ServiceProvider.GetRequiredService<IPasswordHasher<User>>().HashPassword(admin, adminPassword);
            db.Users.Add(admin); await db.SaveChangesAsync();
        }
    }
}

var auth = app.MapGroup("/api/auth");
auth.MapPost("/register", async (RegisterRequest input, AppDbContext db, IPasswordHasher<User> hasher, TokenService tokens) => {
    if (!Valid(input, out var error)) return Results.BadRequest(new { message = error });
    var email = input.Email.Trim().ToLowerInvariant();
    if (await db.Users.AnyAsync(x => x.Email == email)) return Results.Conflict(new { message = "Ten adres e-mail jest już zajęty." });
    var user = new User { Email = email, FirstName = input.FirstName.Trim(), LastName = input.LastName.Trim(), Role = "user" };
    user.PasswordHash = hasher.HashPassword(user, input.Password);
    db.Users.Add(user);
    try { await db.SaveChangesAsync(); } catch (DbUpdateException) { return Results.Conflict(new { message = "Ten adres e-mail jest już zajęty." }); }
    return Results.Ok(new { token = tokens.Create(user), user = new { user.Id, user.Email, user.FirstName, user.LastName, user.Role } });
});
auth.MapPost("/login", async (LoginRequest input, AppDbContext db, IPasswordHasher<User> hasher, TokenService tokens) => {
    if (!Valid(input, out var error)) return Results.BadRequest(new { message = error });
    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == input.Email.Trim().ToLowerInvariant());
    if (user is null || hasher.VerifyHashedPassword(user, user.PasswordHash, input.Password) == PasswordVerificationResult.Failed)
        return Results.Json(new { message = "Nieprawidłowy e-mail lub hasło." }, statusCode: 401);
    return Results.Ok(new { token = tokens.Create(user), user = new { user.Id, user.Email, user.FirstName, user.LastName, user.Role } });
});

var animals = app.MapGroup("/api/animals");
animals.MapGet("/", async (AppDbContext db, string? search, string? species, bool availableOnly = true) => {
    var q = db.Pets.Include(p => p.Images).AsNoTracking().AsQueryable();
    if (availableOnly) q = q.Where(p => p.Status == "dostepny");
    if (!string.IsNullOrWhiteSpace(species)) q = q.Where(p => p.Species == species);
    if (!string.IsNullOrWhiteSpace(search)) q = q.Where(p => EF.Functions.ILike(p.Name, $"%{search}%") || EF.Functions.ILike(p.Description, $"%{search}%"));
    var data = await q.OrderBy(p => p.Id).ToListAsync();
    return Results.Ok(data.Select(ApiDtos.Animal));
});
animals.MapGet("/{id:int}", async (int id, AppDbContext db) => {
    var pet = await db.Pets.Include(p => p.Images).AsNoTracking().SingleOrDefaultAsync(p => p.Id == id);
    return pet is null ? Results.NotFound(new { message = "Nie znaleziono zwierzęcia." }) : Results.Ok(ApiDtos.Animal(pet));
});
animals.MapPost("/", async (AnimalRequest input, AppDbContext db) => {
    if (!Valid(input, out var err) || !ValidAnimal(input)) return Results.BadRequest(new { message = err ?? "Niepoprawne dane zwierzęcia." });
    var pet = new Pet(); ApplyAnimal(pet, input);
    db.Pets.Add(pet); await db.SaveChangesAsync();
    return Results.Created($"/api/animals/{pet.Id}", ApiDtos.Animal(pet));
}).RequireAuthorization("admin");
animals.MapPut("/{id:int}", async (int id, AnimalRequest input, AppDbContext db) => {
    if (!Valid(input, out var err) || !ValidAnimal(input)) return Results.BadRequest(new { message = err ?? "Niepoprawne dane zwierzęcia." });
    var pet = await db.Pets.Include(p => p.Images).SingleOrDefaultAsync(p => p.Id == id);
    if (pet is null) return Results.NotFound(new { message = "Nie znaleziono zwierzęcia." });
    ApplyAnimal(pet, input); await db.SaveChangesAsync(); return Results.Ok(ApiDtos.Animal(pet));
}).RequireAuthorization("admin");
animals.MapDelete("/{id:int}", async (int id, AppDbContext db) => {
    var pet = await db.Pets.Include(p => p.Images).SingleOrDefaultAsync(p => p.Id == id);
    if (pet is null) return Results.NotFound();
    if (await db.AdoptionApplications.AnyAsync(a => a.PetId == id))
        return Results.Conflict(new { message = "Zwierzę ma historię zgłoszeń. Ustaw je jako niedostępne zamiast usuwać." });
    db.Pets.Remove(pet); await db.SaveChangesAsync(); return Results.NoContent();
}).RequireAuthorization("admin");
// Dodawanie pliku ze zdjęciem i udostępnienie go z wwwroot/uploads.
animals.MapPost("/{id:int}/images", async (int id, IFormFile file, AppDbContext db, IWebHostEnvironment env, HttpContext http) => {
    var pet = await db.Pets.Include(p => p.Images).SingleOrDefaultAsync(p => p.Id == id);
    if (pet is null) return Results.NotFound();
    if (file.Length < 12 || file.Length > 5 * 1024 * 1024) return Results.BadRequest(new { message = "Zdjęcie musi mieć od 1 B do 5 MB." });
    var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
    if (extension is not (".jpg" or ".jpeg" or ".png" or ".webp")) return Results.BadRequest(new { message = "Dopuszczalne formaty: JPG, PNG, WEBP." });
    var signature = new byte[12];
    await using (var stream = file.OpenReadStream()) { await stream.ReadExactlyAsync(signature.AsMemory(0, (int)Math.Min(12, file.Length))); }
    bool valid = extension switch {
        ".jpg" or ".jpeg" => signature[0] == 0xFF && signature[1] == 0xD8,
        ".png" => signature.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
        ".webp" => Encoding.ASCII.GetString(signature, 0, 4) == "RIFF" && Encoding.ASCII.GetString(signature, 8, 4) == "WEBP",
        _ => false };
    if (!valid) return Results.BadRequest(new { message = "Plik nie jest poprawnym obrazem." });
    var uploadDirectory = Path.Combine(env.ContentRootPath, "wwwroot", "uploads"); Directory.CreateDirectory(uploadDirectory);
    var name = $"{Guid.NewGuid():N}{extension}";
    await using (var output = File.Create(Path.Combine(uploadDirectory, name))) await file.CopyToAsync(output);
    var photo = new PetImage { PetId = id, Url = $"{http.Request.Scheme}://{http.Request.Host}/uploads/{name}", IsMain = !pet.Images.Any() };
    db.PetImages.Add(photo); await db.SaveChangesAsync();
    return Results.Created($"/api/animals/{id}", new { photo.Id, photo.Url, photo.IsMain });
}).RequireAuthorization("admin").DisableAntiforgery();
animals.MapDelete("/{id:int}/images/{imageId:int}", async (int id, int imageId, AppDbContext db, IWebHostEnvironment env) => {
    var image = await db.PetImages.SingleOrDefaultAsync(x => x.PetId == id && x.Id == imageId);
    if (image is null) return Results.NotFound();
    db.PetImages.Remove(image); await db.SaveChangesAsync();
    if (Uri.TryCreate(image.Url, UriKind.Absolute, out var uri) && uri.AbsolutePath.StartsWith("/uploads/")) {
        var local = Path.Combine(env.ContentRootPath, "wwwroot", "uploads", Path.GetFileName(uri.AbsolutePath));
        if (File.Exists(local)) File.Delete(local);
    }
    return Results.NoContent();
}).RequireAuthorization("admin");

var applications = app.MapGroup("/api/adoption-applications").RequireAuthorization();
applications.MapPost("/", async (ApplicationRequest input, ClaimsPrincipal principal, AppDbContext db) => {
    if (!Valid(input, out var err) || input.AnimalId <= 0 || string.IsNullOrWhiteSpace(input.Phone) || string.IsNullOrWhiteSpace(input.HomeType))
        return Results.BadRequest(new { message = err ?? "Uzupełnij wszystkie pola zgłoszenia." });
    var pet = await db.Pets.FindAsync(input.AnimalId);
    if (pet is null) return Results.NotFound(new { message = "Nie znaleziono zwierzęcia." });
    if (pet.Status != "dostepny") return Results.Conflict(new { message = "To zwierzę nie jest dostępne do adopcji." });
    var uid = UserId(principal);
    if (await db.AdoptionApplications.AnyAsync(a => a.UserId == uid && a.PetId == pet.Id && (a.Status == "Pending" || a.Status == "UnderReview")))
        return Results.Conflict(new { message = "Masz już aktywne zgłoszenie dotyczące tego zwierzęcia." });
    var application = new AdoptionApplication { UserId = uid, PetId = pet.Id, Phone = input.Phone.Trim(), HomeType = input.HomeType.Trim(), HasGarden = input.HasGarden, Content = input.Reason.Trim() };
    db.AdoptionApplications.Add(application); await db.SaveChangesAsync();
    await db.Entry(application).Reference(x => x.User).LoadAsync();
    application.Pet = pet;
    return Results.Created($"/api/adoption-applications/{application.Id}", ApiDtos.Application(application));
});
applications.MapGet("/my", async (ClaimsPrincipal principal, AppDbContext db) => {
    var userId = UserId(principal);

    var all = await ApplicationQuery(db)
        .Where(a => a.UserId == userId)
        .OrderByDescending(a => a.SubmittedAt)
        .ToListAsync();

    return Results.Ok(all.Select(ApiDtos.Application));
});
applications.MapGet("/", async (AppDbContext db) => {
    var all = await ApplicationQuery(db).OrderByDescending(a => a.SubmittedAt).ToListAsync();
    return Results.Ok(all.Select(ApiDtos.Application));
}).RequireAuthorization("admin");
applications.MapGet("/{id:int}", async (int id, ClaimsPrincipal principal, AppDbContext db) => {
    var a = await ApplicationQuery(db).SingleOrDefaultAsync(a => a.Id == id);
    if (a is null) return Results.NotFound();
    if (!principal.IsInRole("admin") && a.UserId != UserId(principal)) return Results.Forbid();
    return Results.Ok(ApiDtos.Application(a));
});
applications.MapPatch("/{id:int}/status", async (int id, StatusRequest input, AppDbContext db) => {
    if (input.Status is not ("Pending" or "UnderReview" or "Approved" or "Rejected"))
        return Results.BadRequest(new { message = "Nieznany status. Wybierz Pending, UnderReview, Approved lub Rejected." });
    var a = await db.AdoptionApplications.Include(x => x.Pet).SingleOrDefaultAsync(x => x.Id == id);
    if (a is null) return Results.NotFound();
    if (input.Status == "Approved" && a.Pet.Status != "dostepny" && a.Status != "Approved")
        return Results.Conflict(new { message = "Zwierzę nie jest dostępne." });
    a.Status = input.Status;
    if (input.Status == "Approved") {
        a.Pet.Status = "adoptowany";
        var others = await db.AdoptionApplications.Where(x => x.PetId == a.PetId && x.Id != a.Id && (x.Status == "Pending" || x.Status == "UnderReview")).ToListAsync();
        foreach (var other in others) other.Status = "Rejected";
    }
    await db.SaveChangesAsync(); return Results.Ok(new { a.Id, a.Status });
}).RequireAuthorization("admin");

app.MapGet("/api/admin/statistics", async (AppDbContext db) => Results.Ok(new {
    AnimalsTotal = await db.Pets.CountAsync(), AnimalsAvailable = await db.Pets.CountAsync(p => p.Status == "dostepny"),
    ApplicationsTotal = await db.AdoptionApplications.CountAsync(),
    ApplicationsApproved = await db.AdoptionApplications.CountAsync(a => a.Status == "Approved"),
    ApplicationsPending = await db.AdoptionApplications.CountAsync(a => a.Status == "Pending"),
    ApplicationsUnderReview = await db.AdoptionApplications.CountAsync(a => a.Status == "UnderReview"),
    ApplicationsRejected = await db.AdoptionApplications.CountAsync(a => a.Status == "Rejected"),
    UsersTotal = await db.Users.CountAsync(u => u.Role == "user")
})).RequireAuthorization("admin");

app.Run();

static int UserId(ClaimsPrincipal user) => int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
static IQueryable<AdoptionApplication> ApplicationQuery(AppDbContext db) => db.AdoptionApplications.Include(a => a.Pet).Include(a => a.User).AsNoTracking();
static bool Valid<T>(T obj, out string? error) {
    var results = new List<System.ComponentModel.DataAnnotations.ValidationResult>();
    var ok = System.ComponentModel.DataAnnotations.Validator.TryValidateObject(obj!, new System.ComponentModel.DataAnnotations.ValidationContext(obj!), results, true);
    error = ok ? null : results.FirstOrDefault()?.ErrorMessage; return ok;
}
static bool ValidAnimal(AnimalRequest a) => !string.IsNullOrWhiteSpace(a.Name) && !string.IsNullOrWhiteSpace(a.Description)
    && (a.Species is "Dog" or "Cat" or "Other") && (a.Gender is "Male" or "Female");
static void ApplyAnimal(Pet pet, AnimalRequest input) {
    pet.Name = input.Name.Trim(); pet.Species = input.Species; pet.Breed = input.Breed?.Trim() ?? "";
    pet.AgeInMonths = input.Age * 12; pet.Gender = input.Gender;
    pet.Description = input.Description.Trim(); pet.Traits = input.Traits?.Trim() ?? "";
    pet.Status = input.IsAvailable ? "dostepny" : "niedostepny";
    // URL z formularza jest obsługiwany w istniejącym modelu PetImage.
    var main = pet.Images.FirstOrDefault(i => i.IsMain) ?? pet.Images.FirstOrDefault();
    if (!string.IsNullOrWhiteSpace(input.PhotoUrl)) {
        if (main is null) pet.Images.Add(new PetImage { Url = input.PhotoUrl.Trim(), IsMain = true });
        else main.Url = input.PhotoUrl.Trim();
    } else if (main is not null) pet.Images.Remove(main);
}
