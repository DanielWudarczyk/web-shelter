using WebShelter.API.Models;
namespace WebShelter.API.Services;
public static class ApiDtos
{
    public static object Animal(Pet p) => new
    {
        p.Id,
        p.Name,
        p.Species,
        p.Breed,
        Age = p.AgeInMonths / 12,
        p.AgeInMonths,
        p.Gender,
        p.Description,
        p.Traits,
        PhotoUrl = p.Images.FirstOrDefault(x => x.IsMain)?.Url ?? p.Images.OrderBy(x => x.SortOrder).ThenBy(x => x.Id).FirstOrDefault()?.Url,
        IsAvailable = p.Status == "dostepny",
        Images = p.Images.OrderBy(i => i.SortOrder).ThenBy(i => i.Id).Select(i => new { i.Id, i.Url, i.IsMain, i.SortOrder }).ToList()
    };
    public static object Application(AdoptionApplication a) => new
    {
        a.Id,
        AnimalId = a.PetId,
        AnimalName = a.Pet.Name,
        ApplicantName = $"{a.User.FirstName} {a.User.LastName}".Trim(),
        ApplicantEmail = a.User.Email,
        a.Phone,
        a.HomeType,
        a.HasGarden,
        Reason = a.Content,
        a.Status,
        a.SubmittedAt,
        Animal = new { a.Pet.Id, a.Pet.Name },
        User = new { a.User.Id, a.User.FirstName, a.User.LastName, a.User.Email }
    };
}
