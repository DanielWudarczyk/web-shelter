# WebShelter — backend ASP.NET Core 9 + PostgreSQL w Neon.tech

## Uruchomienie

Wymagany .NET SDK 9 oraz Node.js. W katalogu `WebShelter.API` skonfiguruj user-secrets **(do drugiej i trzeciej komendy weź PASSWORD i JWT_KEY od Daniela)**:

```bash
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=ep-damp-tree-b9209bdx-pooler.c-7.eu-central-1.aws.neon.tech;Port=5432;Database=neondb;Username=neondb_owner;Password=PASSWORD;SSL Mode=Require;Channel Binding=Require"
dotnet user-secrets set "Jwt:Key" "JWT_KEY"
dotnet user-secrets set "SeedAdmin:Email" "admin@schronisko.pl"
dotnet user-secrets set "SeedAdmin:Password" "admin123"
dotnet user-secrets set "Database:EnsureCreated" "false"
dotnet restore
dotnet run --launch-profile http
```

API: `http://localhost:5000`, test `http://localhost:5000/api/health`.


## Endpointy

| Metoda | Adres | Uprawnienia |
|---|---|---|
| POST | `/api/auth/register` | publiczny |
| POST | `/api/auth/login` | publiczny |
| GET | `/api/animals?search=&species=&availableOnly=` | zalogowany |
| GET | `/api/animals/{id}` | zalogowany |
| POST, PUT, DELETE | `/api/animals` / `/api/animals/{id}` | admin |
| POST | `/api/animals/{id}/images` | admin, multipart `file` |
| DELETE | `/api/animals/{id}/images/{imageId}` | admin |
| POST | `/api/adoption-applications` | zalogowany |
| GET | `/api/adoption-applications/my` | zalogowany |
| GET | `/api/adoption-applications` | admin |
| GET | `/api/adoption-applications/{id}` | autor lub admin |
| PATCH | `/api/adoption-applications/{id}/status` | admin |
| GET | `/api/admin/statistics` | admin |

Logowanie: POST `/api/auth/login`, body JSON `{"email":"admin@schronisko.pl","password":"..."}`; potem `Authorization: Bearer <token>`.

Statusy zgłoszeń: `Pending`, `UnderReview`, `Approved`, `Rejected`. Zaakceptowanie zgłoszenia oznacza zwierzę jako niedostępne i odrzuca pozostałe oczekujące zgłoszenia.

## Dodatkowe uwagi

- Pliki zdjęć znajdują się **na dysku backendu** (`wwwroot/uploads`), a nie w Neon; baza przechowuje ich adresy. W Dockerze katalog zdjęć korzysta z wolumenu `uploads`. Po wdrożeniu do hostingu zadbaj o trwałe przechowywanie zdjęć.
- Zmiana zaakceptowanego zgłoszenia z powrotem na inny status nie przywraca automatycznie dostępności zwierzęcia.
- Neon zapewnia bazę w chmurze, ale wymaganie **całego systemu dostępnego online** wymaga jeszcze wdrożenia API i frontendu oraz skonfigurowania HTTPS/CORS.
- Nie testowano kompilacji ani połączenia z Neon w środowisku generowania archiwum; potrzebne jest uruchomienie na Twoim komputerze.
