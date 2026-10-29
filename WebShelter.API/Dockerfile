FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY WebShelter.API.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /out --no-restore
FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY --from=build /out .
RUN mkdir -p wwwroot/uploads
EXPOSE 8080
ENTRYPOINT ["dotnet", "WebShelter.API.dll"]
