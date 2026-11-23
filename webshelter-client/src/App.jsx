import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

const STATUS_LABELS = {
    Pending: 'Oczekujące',
    UnderReview: 'W trakcie rozpatrywania',
    Approved: 'Zaakceptowane',
    Rejected: 'Odrzucone',
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS);
const EMPTY_ANIMAL = {
    name: '', species: 'Dog', age: 1, gender: 'Male', description: '', traits: '', isAvailable: true,
};

function readSession() {
    try { return JSON.parse(localStorage.getItem('adoptuj-session') || 'null'); }
    catch { return null; }
}

async function api(path, { token, ...options } = {}) {
    const headers = {
        ...(options.body && !(options.body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
        ...(options.headers || {}),
    };

    if (token) headers.Authorization = `Bearer ${token}`;
    let response;

    try {
        response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch {
        throw new Error(`Nie można połączyć się z API (${API_BASE}). Sprawdź adres backendu i CORS.`);
    }

    const raw = await response.text();
    let data = null;

    if (raw) {
        try { data = JSON.parse(raw); } catch { data = raw; }
    }

    if (!response.ok) {
        const message = data?.message || data?.title || (typeof data === 'string' ? data : '') || `Błąd HTTP ${response.status}`;
        throw new Error(message);
    }

    return data;
}

function listFrom(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;

    return [];
}

// Pliki w Neon mają adres /api/animals/.../file.
// Przy hostingu React i API będą miały różne domeny, więc używamy adresu API.
function resolvePhotoUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return new URL(url.startsWith('/') ? url : `/${url}`, API_BASE).href;
}

function imagesFor(animal) {
    const images = animal?.images ?? animal?.Images ?? [];
    if (images.length > 0) {
        return [...images].map(image => ({
            ...image,
            url: resolvePhotoUrl(image.url ?? image.Url)
        })).sort((a, b) =>
            (a.sortOrder ?? a.SortOrder ?? 0) - (b.sortOrder ?? b.SortOrder ?? 0) ||
            (a.id ?? a.Id ?? 0) - (b.id ?? b.Id ?? 0)
        );
    }
    // Zgodność ze starymi rekordami: URL można wyświetlać, ale nie można go dodawać.
    const legacy = animal?.photoUrl ?? animal?.PhotoUrl;
    return legacy ? [{ id: null, url: resolvePhotoUrl(legacy), isMain: true, sortOrder: 0 }] : [];
}
function imageFor(animal) {
    const photos = imagesFor(animal);
    const main = photos.find(photo => photo.isMain ?? photo.IsMain);
    const photo = main || photos[0];
    return photo?.url ?? photo?.Url ?? '';
}

function animalName(app) {
    return app?.animalName || app?.animal?.name || `Zwierzę #${app?.animalId ?? ''}`;
}

function personName(app) {
    return app?.applicantName || app?.userName || app?.user?.firstName && `${app.user.firstName} ${app.user.lastName || ''}`.trim() || app?.applicantEmail || 'Użytkownik';
}

function prettyDate(value) {
    if (!value) return '—';
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pl-PL');
}
export default function App() {

    const [registerMode, setRegisterMode] = useState(false);
    const [session, setSession] = useState(readSession);
    const [screen, setScreen] = useState(() => readSession()?.user?.role?.toLowerCase() === 'admin' ? 'adminDashboard' : 'animals');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [animals, setAnimals] = useState([]);
    const [search, setSearch] = useState('');
    const [speciesFilter, setSpeciesFilter] = useState('');
    const [selectedAnimal, setSelectedAnimal] = useState(null);
    const [applicationForm, setApplicationForm] = useState({ phone: '', homeType: '', hasGarden: '', reason: '' });
    const [myApplications, setMyApplications] = useState([]);
    const [applications, setApplications] = useState([]);
    const [selectedApplication, setSelectedApplication] = useState(null);
    const [statusDraft, setStatusDraft] = useState('Pending');
    const [statistics, setStatistics] = useState(null);
    const [editingAnimal, setEditingAnimal] = useState(null);
    const [animalForm, setAnimalForm] = useState(EMPTY_ANIMAL);
    const [existingImages, setExistingImages] = useState([]);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [activePhoto, setActivePhoto] = useState(0);

    const isAdmin = String(session?.user?.role || '').toLowerCase() === 'admin';

    const token = session?.token;
    const request = useCallback((path, options = {}) => api(path, { ...options, token }), [token]);


    const go = (nextScreen) => {

        setError('');
        setNotice('');
        setScreen(nextScreen);
        setSelectedAnimal(null);
        setSelectedApplication(null);
    };

    useEffect(() => {
        let active = true;

        const load = async () => {
            setLoading(true);
            setError('');

            try {

                if (screen === 'animals' || screen === 'adminAnimals') {
                    const params = new URLSearchParams();
                    if (search.trim()) params.set('search', search.trim());

                    if (speciesFilter) params.set('species', speciesFilter);

                    if (isAdmin) params.set('availableOnly', 'false');

                    const query = params.toString();
                    const data = await request(`/animals${query ? `?${query}` : ''}`);

                    if (active) setAnimals(listFrom(data));

                } else if (screen === 'myApplications') {
                    const data = await request('/adoption-applications/my');
                    if (active) setMyApplications(listFrom(data));

                } else if (screen === 'adminApplications') {
                    if (!isAdmin) throw new Error('Brak uprawnień administratora.');
                    const data = await request('/adoption-applications');

                    if (active) setApplications(listFrom(data));

                } else if (screen === 'adminDashboard' || screen === 'adminStatistics') {
                    if (!isAdmin) throw new Error('Brak uprawnień administratora.');
                    const data = await request('/admin/statistics');

                    if (active) setStatistics(data);
                }

            } catch (e) {
                if (active) setError(e.message || 'Nie udało się pobrać danych.');

            } finally {
                if (active) setLoading(false);
            }
        };

        load();
        return () => { active = false; };

    }, [session, screen, request, refreshKey, isAdmin, search, speciesFilter]);

    async function handleLogin(event) {
        event.preventDefault();
        setLoading(true); setError('');

        const form = new FormData(event.currentTarget);

        try {
            const data = await api('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),

            });

            if (!data?.token || !data?.user) throw new Error('Nieprawidłowa odpowiedź logowania. Oczekiwano pól token i user.');

            const nextSession = { token: data.token, user: data.user };
            localStorage.setItem('adoptuj-session', JSON.stringify(nextSession));
            setSession(nextSession);
            setScreen(

                String(data.user.role).toLowerCase() === 'admin'
                    ? 'adminDashboard'
                    : selectedAnimal
                        ? 'adoptionForm'
                        : 'animals'
            );

            setNotice('Zalogowano pomyślnie.');
        } catch (e) {
            setError(e.message || 'Logowanie nie powiodło się.');
        } finally { setLoading(false); }
    }

    async function handleRegister(event) {
        event.preventDefault();
        setLoading(true);
        setError('');

        const form = new FormData(event.currentTarget);

        try {
            const data = await api('/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    firstName: form.get('firstName'),
                    lastName: form.get('lastName'),
                    email: form.get('email'),
                    password: form.get('password'),
                }),
            });

            if (!data?.token || !data?.user) {
                throw new Error('Nieprawidłowa odpowiedź serwera.');
            }

            const nextSession = {
                token: data.token,
                user: data.user,
            };

            localStorage.setItem(
                'adoptuj-session',
                JSON.stringify(nextSession)
            );

            setSession(nextSession);
            setRegisterMode(false);
            setScreen(selectedAnimal ? 'adoptionForm' : 'animals');
            setNotice('Konto zostało utworzone.');


        } catch (e) {

            setError(e.message || 'Rejestracja nie powiodła się.');

        } finally {
            setLoading(false);
        }
    }

    function logout() {
        localStorage.removeItem('adoptuj-session');
        setSession(null); setSelectedAnimal(null); setSelectedApplication(null);
        setNotice(''); setError(''); setScreen('animals');
    }

    async function openAnimal(animal) {
        setActivePhoto(0);
        setLoading(true); setError(''); setNotice('');

        try {
            const detail = await request(`/animals/${animal.id}`);
            setSelectedAnimal(detail);
            setScreen('animalDetail');
        } catch (e) {
            setError(e.message || 'Nie udało się pobrać szczegółów zwierzęcia.');
        } finally { setLoading(false); }
    }

    async function submitAdoption(event) {
        event.preventDefault();

        if (!session?.token) {
            setRegisterMode(false);
            setScreen('auth');
            return;
        }

        setLoading(true); setError(''); setNotice('');

        try {
            await request('/adoption-applications', {
                method: 'POST',
                body: JSON.stringify({
                    animalId: selectedAnimal.id,
                    phone: applicationForm.phone,
                    homeType: applicationForm.homeType,
                    hasGarden: applicationForm.hasGarden === 'true',
                    reason: applicationForm.reason,
                }),
            });

            setNotice('Zgłoszenie zostało wysłane. Możesz śledzić jego status w sekcji „Moje zgłoszenia”.');
            setApplicationForm({ phone: '', homeType: '', hasGarden: '', reason: '' });
            setScreen('myApplications');
            setRefreshKey((key) => key + 1);

        } catch (e) { setError(e.message || 'Nie udało się wysłać zgłoszenia.'); }
        finally { setLoading(false); }
    }

    function addFiles(event) {

        const files = Array.from(event.target.files || []);

        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/webp'
        ];

        const invalidFile = files.find(

            file =>
                !allowedTypes.includes(file.type) ||
                file.size === 0 ||
                file.size > 5 * 1024 * 1024
        );

        if (invalidFile) {
            setError(
                'Dozwolone są zdjęcia JPG, PNG i WEBP o rozmiarze do 5 MB.'
            );
            event.target.value = '';
            return;

        }

        const allFiles = [...selectedFiles];

        for (const file of files) {
            if (!allFiles.some(
                existing =>
                    existing.name === file.name &&
                    existing.size === file.size &&
                    existing.lastModified === file.lastModified
            )) {
                allFiles.push(file);
            }
        }
        const existingCount = existingImages.length;

        if (existingCount + allFiles.length > 10) {
            setError('Jedno zwierzę może mieć maksymalnie 10 zdjęć.');
            event.target.value = '';
            return;
        }
        setSelectedFiles(allFiles);
        setError('');
        event.target.value = '';

    }

    function startCreateAnimal() {
        setEditingAnimal(null);
        setAnimalForm({ ...EMPTY_ANIMAL });
        setExistingImages([]);
        setSelectedFiles([]);
        setError('');
        setNotice('');
        setScreen('animalForm');
    }

    async function startEditAnimal(animal) {
        setLoading(true);
        setError('');
        setNotice('');
        try {
            const detail = await request(`/animals/${animal.id}`);
            setEditingAnimal(detail);
            setAnimalForm({
                ...EMPTY_ANIMAL,
                ...detail,
                age: Number(detail.age) || 0,
                isAvailable: Boolean(detail.isAvailable),
            });
            setExistingImages(imagesFor(detail).filter(p => (p.id ?? p.Id) != null));
            setSelectedFiles([]);
            setScreen('animalForm');
        } catch (e) {
            setError(e.message || 'Nie udało się pobrać szczegółów zwierzęcia.');
        } finally {
            setLoading(false);
        }
    }

    async function refreshAnimalImages(animalId) {
        const detail = await request(`/animals/${animalId}`);
        setEditingAnimal(detail);
        setExistingImages(imagesFor(detail).filter(p => (p.id ?? p.Id) != null));
        setRefreshKey(key => key + 1);
    }

    async function deleteExistingImage(photo) {
        if (!editingAnimal || !window.confirm('Na pewno usunąć to zdjęcie?')) return;
        setLoading(true); setError(''); setNotice('');
        try {
            await request(`/animals/${editingAnimal.id}/images/${photo.id ?? photo.Id}`, { method: 'DELETE' });
            await refreshAnimalImages(editingAnimal.id);
            setNotice('Zdjęcie zostało usunięte.');
        } catch (e) {
            setError(e.message || 'Nie udało się usunąć zdjęcia.');
        } finally { setLoading(false); }
    }

    async function setMainImage(photo) {
        if (!editingAnimal) return;
        setLoading(true); setError(''); setNotice('');
        try {
            await request(`/animals/${editingAnimal.id}/images/${photo.id ?? photo.Id}/main`, { method: 'PUT' });
            await refreshAnimalImages(editingAnimal.id);
            setNotice('Ustawiono zdjęcie główne.');
        } catch (e) {
            setError(e.message || 'Nie udało się ustawić zdjęcia głównego.');
        } finally { setLoading(false); }
    }

    async function moveImage(index, direction) {
        if (!editingAnimal) return;
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= existingImages.length) return;
        const reordered = [...existingImages];
        [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
        setLoading(true); setError(''); setNotice('');
        try {
            await request(`/animals/${editingAnimal.id}/images/order`, {
                method: 'PUT',
                body: JSON.stringify({ imageIds: reordered.map(photo => photo.id ?? photo.Id) }),
            });
            await refreshAnimalImages(editingAnimal.id);
            setNotice('Zapisano kolejność zdjęć.');
        } catch (e) {
            setError(e.message || 'Nie udało się zmienić kolejności zdjęć.');
        } finally { setLoading(false); }
    }

    async function saveAnimal(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');

    const payload = {
        name: animalForm.name.trim(),
        species: animalForm.species,
        age: Number(animalForm.age),
        gender: animalForm.gender,
        description: animalForm.description.trim(),
        traits: animalForm.traits.trim(),
        isAvailable: Boolean(animalForm.isAvailable),
    };

    let animalId = editingAnimal?.id;

    try {

        // 1. Najpierw zapisujemy dane zwierzęcia.
        if (editingAnimal) {
            await request(`/animals/${animalId}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
            });

        } else {
            const created = await request('/animals', {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            animalId = created.id;

            if (!animalId) {
                throw new Error(
                    'Serwer nie zwrócił ID nowego zwierzęcia.'
                );
            }
        }

        // 2. Następnie przesyłamy wybrane zdjęcia.
        for (const file of selectedFiles) {
            const formData = new FormData();
            formData.append('file', file);

            await request(`/animals/${animalId}/images`, {
                method: 'POST',
                body: formData,
            });
        }

        // 3. Po zapisaniu wracamy do listy.
        setSelectedFiles([]);
        setScreen('adminAnimals');
        setRefreshKey(key => key + 1);
        setNotice('Zwierzę i zdjęcia zostały zapisane.');

    } catch (e) {
        setError(e.message || 'Nie udało się zapisać zwierzęcia.');
        setNotice(
            'Jeśli zapis zdjęć został przerwany, sprawdź profil zwierzęcia przed ponowną próbą.'
        );

    } finally {
        setLoading(false);
    }
}

    async function deleteAnimal(animal) {
        if (!window.confirm(`Czy na pewno usunąć profil „${animal.name}”?`)) return;
        setLoading(true); setError(''); setNotice('');

        try {
            await request(`/animals/${animal.id}`, { method: 'DELETE' });
            setNotice('Profil zwierzęcia został usunięty.'); setRefreshKey((key) => key + 1);
        } catch (e) { setError(e.message || 'Nie udało się usunąć zwierzęcia.'); }
        finally { setLoading(false); }
    }

    async function openApplication(app) {
        setLoading(true); setError(''); setNotice('');

        try {
            const detail = await request(`/adoption-applications/${app.id}`);
            setSelectedApplication(detail); setStatusDraft(detail.status || 'Pending'); setScreen('applicationDetail');
        } catch (e) { setError(e.message || 'Nie udało się pobrać zgłoszenia.'); }
        finally { setLoading(false); }
    }

    async function updateApplicationStatus(event) {

        event.preventDefault(); if (!selectedApplication) return;
        setLoading(true); setError(''); setNotice('');

        try {
            await request(`/adoption-applications/${selectedApplication.id}/status`, {
                method: 'PATCH', body: JSON.stringify({ status: statusDraft }),
            });

            setNotice('Status zgłoszenia został zmieniony.');
            setSelectedApplication({ ...selectedApplication, status: statusDraft });
            setRefreshKey((key) => key + 1);

        } catch (e) { setError(e.message || 'Nie udało się zmienić statusu.'); }
        finally { setLoading(false); }
    }

    const pageTitle = useMemo(() => ({
        animals: 'Zwierzęta do adopcji', animalDetail: 'Poznaj swojego przyjaciela', adoptionForm: 'Formularz adopcyjny',
        myApplications: 'Moje zgłoszenia', adminDashboard: 'Panel administratora', adminAnimals: 'Zarządzanie zwierzętami',
        animalForm: editingAnimal ? 'Edytuj zwierzę' : 'Dodaj zwierzę', adminApplications: 'Zgłoszenia adopcyjne',
        applicationDetail: 'Szczegóły zgłoszenia', adminStatistics: 'Statystyki',
    }[screen] || 'Adoptuj'), [screen, editingAnimal]);

    if (screen === 'auth') {

    return (
        <main className="login-page">
            <form
                className="login-card"
                onSubmit={registerMode ? handleRegister : handleLogin}
            >
                <div className="brand">
                    <span className="brand-icon">🐾</span>
                    <span>Adoptuj</span>
                </div>

                <p className="eyebrow">
                    SCHRONISKO · NOWY POCZĄTEK
                </p>

                <h1>
                    {registerMode ? 'Utwórz konto' : 'Zaloguj się'}
                </h1>

                <p className="muted">
                    {registerMode
                        ? 'Zarejestruj się, aby składać wnioski adopcyjne.'
                        : 'Zaloguj się, aby złożyć wniosek adopcyjny.'}
                </p>

                {error && (
                    <div className="alert error" role="alert">
                        {error}
                    </div>
                )}
                {registerMode && (
                    <>
                        <label htmlFor="firstName">Imię</label>
                        <input
                            id="firstName"
                            name="firstName"
                            required
                            maxLength={100}
                        />
                        <label htmlFor="lastName">Nazwisko</label>
                        <input
                            id="lastName"
                            name="lastName"
                            required
                            maxLength={100}
                        />
                    </>
                )}

                <label htmlFor="email">Adres e-mail</label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                />

                <label htmlFor="password">Hasło</label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={registerMode ? 8 : undefined}
                    autoComplete={
                        registerMode ? 'new-password' : 'current-password'
                    }
                />

                <button
                    type="submit"
                    className="button primary full"
                    disabled={loading}
                >
                    {loading
                        ? 'Przetwarzanie…'
                        : registerMode
                            ? 'Zarejestruj się'
                            : 'Zaloguj się'}
                </button>

                <p className="small-note">
                    {registerMode ? 'Masz już konto?' : 'Nie masz konta?'}
                    {' '}
                    <button
                        type="button"
                        className="button ghost"
                        onClick={() => {
                            setRegisterMode(!registerMode);
                            setError('');
                        }}
                    >
                        {registerMode ? 'Zaloguj się' : 'Zarejestruj się'}
                    </button>

                </p>

                <button
                    type="button"
                    className="button secondary full"
                    onClick={() => {
                        setError('');
                        setScreen(selectedAnimal ? 'animalDetail' : 'animals');
                    }}
                >
                    Przeglądaj bez logowania
                </button>
            </form>
        </main>
    );
}

    return <div className="app-shell">
        <header className="topbar">
            <button className="brand brand-button" onClick={() => go(isAdmin ? 'adminDashboard' : 'animals')}><span className="brand-icon">🐾</span><span>Adoptuj</span></button>

            {!isAdmin && <nav className="user-nav"><button className={screen === 'animals' || screen === 'animalDetail' || screen === 'adoptionForm' ? 'nav-item selected' : 'nav-item'} onClick={() => go('animals')}>Zwierzęta</button><button className={screen === 'myApplications' || screen === 'applicationDetail' ? 'nav-item selected' : 'nav-item'} onClick={() => {

                if (!session) {
                    setRegisterMode(false);
                    setScreen('auth');
                } else {
                    go('myApplications');
                }
            }}>Moje zgłoszenia</button></nav>}

            <div className="topbar-right">
                {session ? (
                    <>
                        <span className="role-chip">
                            {isAdmin ? 'Administrator' : 'Użytkownik'}
                        </span>
                        <span className="user-name">
                            {session.user.firstName || session.user.email}
                        </span>

                        <button className="button ghost" onClick={logout}>
                            Wyloguj
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            className="button ghost"
                            onClick={() => {
                                setRegisterMode(false);
                                setScreen('auth');
                            }}
                        >
                            Zaloguj się
                        </button>

                        <button
                            className="button primary"
                            onClick={() => {
                                setRegisterMode(true);
                                setScreen('auth');
                            }}
                        >
                            Zarejestruj się
                        </button>
                    </>
                )}
            </div>
        </header>

        <div className={`layout ${isAdmin ? 'admin-layout' : ''}`}>
            {isAdmin && <aside className="sidebar">
                <span className="sidebar-label">MENU</span>
                <button className={screen === 'adminDashboard' ? 'side-link active' : 'side-link'} onClick={() => go('adminDashboard')}>▦ <span>Dashboard</span></button>
                <button className={screen === 'adminAnimals' || screen === 'animalForm' ? 'side-link active' : 'side-link'} onClick={() => go('adminAnimals')}>♡ <span>Zwierzęta</span></button>
                <button className={screen === 'adminApplications' || screen === 'applicationDetail' ? 'side-link active' : 'side-link'} onClick={() => go('adminApplications')}>▤ <span>Zgłoszenia</span></button>
                <button className={screen === 'adminStatistics' ? 'side-link active' : 'side-link'} onClick={() => go('adminStatistics')}>▥ <span>Statystyki</span></button>
            </aside>}

            <main className="main-content">
                <div className="page-heading"><div><p className="eyebrow">{isAdmin ? 'STREFA ADMINISTRACYJNA' : 'ZNAJDŹ SWOJEGO PRZYJACIELA'}</p><h1>{pageTitle}</h1></div>{loading && <span className="loading-label">Ładowanie…</span>}</div>
                {error && <div className="alert error" role="alert">{error}</div>}
                {notice && <div className="alert success" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Zamknij komunikat">×</button></div>}

                {screen === 'animals' && <>
                    <section className="hero"><div><span className="eyebrow">ADOPCJA Z MIŁOŚCIĄ</span><h2>Daj zwierzakom<br />drugą szansę.</h2><p>Każdy z nich czeka na bezpieczny dom i kochającego opiekuna.</p><a className="button primary" href="#animal-list">Poznaj podopiecznych</a></div><div className="hero-art" aria-hidden="true">🐕</div></section>

                    <div className="toolbar"><input type="search" placeholder="Szukaj po imieniu…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Szukaj zwierząt" /><select value={speciesFilter} onChange={(e) => setSpeciesFilter(e.target.value)} aria-label="Filtruj według gatunku"><option value="">Wszystkie zwierzęta</option><option value="Dog">Psy</option><option value="Cat">Koty</option></select></div>
                    <section id="animal-list" className="animal-grid">{animals.map((animal) => <AnimalCard key={animal.id} animal={animal} onDetails={openAnimal} />)}</section>
                    {!loading && animals.length === 0 && <EmptyState text="Nie znaleziono zwierząt." />}
                </>}

                {screen === 'animalDetail' && selectedAnimal && <>
                    <button className="back-link" onClick={() => go('animals')}>← Wróć do zwierząt</button>
                    <section className="detail-card"><img className="detail-photo" src={
                        imagesFor(selectedAnimal)[activePhoto]?.url ||
                        imageFor(selectedAnimal) ||
                        undefined

                    } alt={selectedAnimal.name} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /><div className="detail-body"><span className="pill">{selectedAnimal.species === 'Dog' ? 'Pies' : selectedAnimal.species === 'Cat' ? 'Kot' : selectedAnimal.species}</span><h2>{selectedAnimal.name}</h2><div className="facts"><span>🎂 {selectedAnimal.age} {Number(selectedAnimal.age) === 1 ? 'rok' : 'lat'}</span><span>{selectedAnimal.gender === 'Male' ? '♂ Samiec' : selectedAnimal.gender === 'Female' ? '♀ Samica' : selectedAnimal.gender}</span></div><h3>O mnie</h3><p>{selectedAnimal.description || 'Schronisko wkrótce uzupełni opis tego zwierzęcia.'}</p><h3>Mój charakter</h3><p>{selectedAnimal.traits || 'Poznaj mnie podczas wizyty w schronisku.'}</p>{selectedAnimal.isAvailable !== false ? 

                    <button
                        className="button primary"
                        onClick={() => {

                            setApplicationForm({
                                phone: '',
                                homeType: '',
                                hasGarden: '',
                                reason: ''
                            });

                            if (!session) {
                                setRegisterMode(false);
                                setScreen('auth');
                                return;
                            }

                            setScreen('adoptionForm');
                        }}
                    >

                        ♥ Chcę adoptować
                    </button> : <div className="alert">To zwierzę nie jest obecnie dostępne do adopcji.</div>}</div></section>
                    {imagesFor(selectedAnimal).length > 1 && (
                        <section className="gallery-section">
                            <h3>Galeria zdjęć</h3>

                            <div className="photo-gallery">
                                {imagesFor(selectedAnimal).map((photo, index) => (
                                    <button
                                        key={photo.id ?? index}
                                        type="button"
                                        className={
                                            activePhoto === index
                                                ? 'gallery-thumb active'
                                                : 'gallery-thumb'
                                        }
                                        onClick={() => setActivePhoto(index)}
                                    >
                                        <LoadingImage
                                        key={photo.url}
                                        src={photo.url}
                                        alt={`Zdjęcie ${index + 1} zwierzęcia`}
                                    />
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}
                </>}

                {screen === 'adoptionForm' && selectedAnimal && <>
                    <button className="back-link" onClick={() => setScreen('animalDetail')}>← Wróć do profilu</button>
                    <form className="panel form-panel" onSubmit={submitAdoption}><div className="panel-title"><div><p className="eyebrow">ZGŁOSZENIE ADOPCYJNE</p><h2>Adoptuj: {selectedAnimal.name}</h2><p className="muted">Uzupełnij informacje, aby schronisko mogło się z Tobą skontaktować.</p></div></div><div className="form-grid"><Field label="Telefon" name="phone" value={applicationForm.phone} onChange={(v) => setApplicationForm({ ...applicationForm, phone: v })} required placeholder="123 456 789" /><div className="field"><label htmlFor="homeType">Miejsce zamieszkania</label><select id="homeType" required value={applicationForm.homeType} onChange={(e) => setApplicationForm({ ...applicationForm, homeType: e.target.value })}><option value="">Wybierz</option><option value="Apartment">Mieszkanie</option><option value="House">Dom</option></select></div><div className="field"><label htmlFor="garden">Czy masz ogród?</label><select id="garden" required value={applicationForm.hasGarden} onChange={(e) => setApplicationForm({ ...applicationForm, hasGarden: e.target.value })}><option value="">Wybierz</option><option value="true">Tak</option><option value="false">Nie</option></select></div><div className="field span-two"><label htmlFor="reason">Dlaczego chcesz adoptować to zwierzę?</label><textarea id="reason" rows="5" required minLength={10} value={applicationForm.reason} onChange={(e) => setApplicationForm({ ...applicationForm, reason: e.target.value })} placeholder="Opowiedz o sobie i warunkach, jakie możesz zapewnić…" /></div></div><p className="small-note">Wysłanie formularza zapisze zgłoszenie na koncie, z którego się zalogowano.</p><button className="button primary" disabled={loading}>{loading ? 'Wysyłanie…' : 'Wyślij zgłoszenie'}</button></form>
                </>}

                {screen === 'myApplications' && <section className="panel"><div className="panel-title"><div><h2>Moje zgłoszenia adopcyjne</h2><p className="muted">Sprawdzaj aktualny stan swoich zgłoszeń.</p></div><button className="button secondary" onClick={() => go('animals')}>Znajdź zwierzę</button></div><ApplicationTable items={myApplications} admin={false} onOpen={openApplication} />{!loading && myApplications.length === 0 && <EmptyState text="Nie masz jeszcze zgłoszeń adopcyjnych." />}</section>}

                {screen === 'adminDashboard' && isAdmin && <><section className="stats-grid"><StatCard title="Wszystkie zwierzęta" value={statistics?.animalsTotal} icon="🐾" /><StatCard title="Dostępne do adopcji" value={statistics?.animalsAvailable} icon="♡" /><StatCard title="Wszystkie zgłoszenia" value={statistics?.applicationsTotal} icon="▤" /><StatCard title="Zaakceptowane" value={statistics?.applicationsApproved} icon="✓" /></section><section className="panel"><div className="panel-title"><div><h2>Ostatnie zgłoszenia</h2><p className="muted">Przejdź do modułu zgłoszeń, aby zarządzać decyzjami.</p></div><button className="button primary" onClick={() => go('adminApplications')}>Zobacz zgłoszenia</button></div></section></>}

                {screen === 'adminAnimals' && isAdmin && <section className="panel"><div className="panel-title"><div><h2>Lista zwierząt</h2><p className="muted">Dodawaj, edytuj i usuwaj profile.</p></div><button className="button primary" onClick={startCreateAnimal}>+ Dodaj zwierzę</button></div><div className="table-wrap admin-animal-list"><table><thead><tr><th>Zwierzę</th><th>Gatunek</th><th>Wiek</th><th>Status</th><th>Akcje</th></tr></thead><tbody>{animals.map((animal) => <tr key={animal.id}><td><div className="animal-cell">{imageFor(animal) ? <img src={imageFor(animal)} alt="" /> : <span className="mini-placeholder">🐾</span>}<strong>{animal.name}</strong></div></td><td>{animal.species === 'Dog' ? 'Pies' : animal.species === 'Cat' ? 'Kot' : animal.species}</td><td>{animal.age}</td><td><StatusPill status={animal.isAvailable === false ? 'Unavailable' : 'Available'} /></td><td><div className="actions"><button className="button small secondary" onClick={() => startEditAnimal(animal)}>Edytuj</button><button className="button small danger" onClick={() => deleteAnimal(animal)}>Usuń</button></div></td></tr>)}</tbody></table></div>{!loading && animals.length === 0 && <EmptyState text="Brak zwierząt w bazie." />}</section>}

                {screen === 'animalForm' && isAdmin && (
                    <form className="panel form-panel" onSubmit={saveAnimal}>
                        <div className="panel-title"><div>
                            <p className="eyebrow">KATALOG ZWIERZĄT</p>
                            <h2>{editingAnimal ? 'Edytuj profil' : 'Dodaj nowe zwierzę'}</h2>
                            <p className="muted">Prześlij zdjęcia z komputera (maksymalnie 10). Podczas edycji możesz usunąć zdjęcie, ustawić główne i zmienić kolejność.</p>
                        </div></div>
                        <div className="form-grid">
                            <Field label="Imię" name="animalName" value={animalForm.name} onChange={v => setAnimalForm({ ...animalForm, name: v })} required />
                            <div className="field"><label htmlFor="species">Gatunek</label><select id="species" value={animalForm.species} onChange={e => setAnimalForm({ ...animalForm, species: e.target.value })}><option value="Dog">Pies</option><option value="Cat">Kot</option></select></div>
                            <Field label="Wiek (w latach)" name="age" type="number" min="0" value={animalForm.age} onChange={v => setAnimalForm({ ...animalForm, age: v })} required />
                            <div className="field"><label htmlFor="gender">Płeć</label><select id="gender" value={animalForm.gender} onChange={e => setAnimalForm({ ...animalForm, gender: e.target.value })}><option value="Male">Samiec</option><option value="Female">Samica</option></select></div>
                            <div className="field span-two">
                                <label htmlFor="animalPhotos">Dodaj zdjęcia z komputera</label>
                                <input id="animalPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addFiles} disabled={loading || existingImages.length + selectedFiles.length >= 10} />
                                <p className="small-note">JPG, PNG, WEBP; maksymalnie 5 MB każde. Łącznie: {existingImages.length + selectedFiles.length}/10.</p>
                                {selectedFiles.length > 0 && (
                                    <div className="selected-file-list">
                                        <strong>Nowe zdjęcia ({selectedFiles.length})</strong>
                                        {selectedFiles.map((file, index) => (
                                            <div className="selected-file" key={`${file.name}-${file.lastModified}-${index}`}>
                                                <span>{file.name}</span>
                                                <button type="button" className="button small secondary" disabled={loading} onClick={() => setSelectedFiles(current => current.filter((_, i) => i !== index))}>Usuń z wyboru</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {editingAnimal && (
                                <div className="field span-two">
                                    <h3>Obecne zdjęcia ({existingImages.length})</h3>
                                    {existingImages.length === 0 ? <p className="muted">Brak zapisanych zdjęć.</p> : (
                                        <div className="admin-photo-grid">
                                            {existingImages.map((photo, index) => (
                                                <div className="admin-photo" key={photo.id ?? photo.Id}>
                                                    <img src={photo.url ?? photo.Url} alt={`Zdjęcie ${index + 1}`} />
                                                    {(photo.isMain ?? photo.IsMain) && <span className="main-photo-label">★ Główne</span>}
                                                    <div className="admin-photo-actions">
                                                        <strong>Zdjęcie {index + 1}</strong>
                                                        {!(photo.isMain ?? photo.IsMain) && <button type="button" className="button small secondary" disabled={loading} onClick={() => setMainImage(photo)}>Ustaw jako główne</button>}
                                                        <div className="photo-order-controls">
                                                            <button type="button" disabled={loading || index === 0} onClick={() => moveImage(index, -1)} title="Przesuń w lewo">←</button>
                                                            <button type="button" disabled={loading || index === existingImages.length - 1} onClick={() => moveImage(index, 1)} title="Przesuń w prawo">→</button>
                                                        </div>
                                                        <button type="button" className="button small danger" disabled={loading} onClick={() => deleteExistingImage(photo)}>Usuń zdjęcie</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <p className="small-note">Usuwanie, zmiana zdjęcia głównego i kolejności zapisują się od razu.</p>
                                </div>
                            )}
                            <div className="field span-two"><label htmlFor="description">Opis</label><textarea id="description" rows="4" required value={animalForm.description} onChange={e => setAnimalForm({ ...animalForm, description: e.target.value })} /></div>
                            <div className="field span-two"><label htmlFor="traits">Cechy charakteru</label><input id="traits" value={animalForm.traits || ''} onChange={e => setAnimalForm({ ...animalForm, traits: e.target.value })} placeholder="np. spokojny, towarzyski" /></div>
                            <label className="checkbox-line span-two"><input type="checkbox" checked={Boolean(animalForm.isAvailable)} onChange={e => setAnimalForm({ ...animalForm, isAvailable: e.target.checked })} /> Dostępne do adopcji</label>
                        </div>
                        <div className="form-actions">
                            <button type="button" className="button secondary" disabled={loading} onClick={() => go('adminAnimals')}>Anuluj</button>
                            <button type="submit" className="button primary" disabled={loading}>{loading ? 'Zapisywanie…' : 'Zapisz'}</button>
                        </div>
                    </form>
                )}

                {screen === 'adminApplications' && isAdmin && <section className="panel"><div className="panel-title"><div><h2>Wszystkie zgłoszenia</h2><p className="muted">Otwórz zgłoszenie, aby sprawdzić formularz i zmienić status.</p></div></div><ApplicationTable items={applications} admin onOpen={openApplication} />{!loading && applications.length === 0 && <EmptyState text="Brak zgłoszeń adopcyjnych." />}</section>}

                {screen === 'applicationDetail' && selectedApplication && <><button className="back-link" onClick={() => go(isAdmin ? 'adminApplications' : 'myApplications')}>← Wróć do zgłoszeń</button><section className="panel detail-application"><p className="eyebrow">ZGŁOSZENIE NR {selectedApplication.id}</p><h2>{animalName(selectedApplication)}</h2><div className="application-facts"><p><strong>Wnioskodawca:</strong> {personName(selectedApplication)}</p><p><strong>E-mail:</strong> {selectedApplication.applicantEmail || selectedApplication.user?.email || '—'}</p><p><strong>Telefon:</strong> {selectedApplication.phone || '—'}</p><p><strong>Data wysłania:</strong> {prettyDate(selectedApplication.submittedAt)}</p><p><strong>Miejsce zamieszkania:</strong> {selectedApplication.homeType || '—'}</p><p><strong>Ogród:</strong> {selectedApplication.hasGarden == null ? '—' : selectedApplication.hasGarden ? 'Tak' : 'Nie'}</p></div><h3>Uzasadnienie adopcji</h3><p className="reason-text">{selectedApplication.reason || 'Brak podanego uzasadnienia.'}</p>{isAdmin ? <form className="status-form" onSubmit={updateApplicationStatus}><div className="field"><label htmlFor="status">Status zgłoszenia</label><select id="status" value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><button className="button primary" disabled={loading}>Zapisz status</button></form> : <p>Status: <StatusPill status={selectedApplication.status} /></p>}</section></>}

                {screen === 'adminStatistics' && isAdmin && <><section className="stats-grid"><StatCard title="Zwierzęta łącznie" value={statistics?.animalsTotal} icon="🐾" /><StatCard title="Dostępne zwierzęta" value={statistics?.animalsAvailable} icon="♡" /><StatCard title="Zgłoszenia" value={statistics?.applicationsTotal} icon="▤" /><StatCard title="Użytkownicy" value={statistics?.usersTotal} icon="♙" /></section><section className="panel"><h2>Statusy zgłoszeń</h2><div className="status-summary">{STATUS_OPTIONS.map(([status, label]) => <div className="status-summary-row" key={status}><StatusPill status={status} /><strong>{statistics?.[`applications${status}`] ?? statistics?.[status.charAt(0).toLowerCase() + status.slice(1)] ?? 0}</strong></div>)}</div></section></>}
            </main>
        </div>
    </div>;
}

function AnimalCard({ animal, onDetails }) {
    const photoUrl = imageFor(animal);

    return (
        <article className="animal-card">
            <div className="animal-image-wrap">
                {photoUrl ? (
                    <LoadingImage
                        key={photoUrl}
                        src={photoUrl}
                        alt={animal.name}
                        className="animal-card-loading"
                    />
                ) : (
                    <div className="image-placeholder">🐾</div>
                )}

                <span className="image-label">
                    {animal.species === 'Dog'
                        ? 'Pies'
                        : animal.species === 'Cat'
                            ? 'Kot'
                            : animal.species}
                </span>
            </div>

            <div className="animal-card-body">
                <div>
                    <h3>{animal.name}</h3>
                    <p>
                        {animal.age} {Number(animal.age) === 1 ? 'rok' : 'lat'}
                    </p>
                </div>

                <button
                    className="button primary full"
                    onClick={() => onDetails(animal)}
                >
                    Zobacz szczegóły
                </button>
            </div>
        </article>
    );
}

function ApplicationTable({ items, admin, onOpen }) {
    return <div className="table-wrap"><table><thead><tr>{admin && <th>Wnioskodawca</th>}<th>Zwierzę</th><th>Data</th><th>Status</th><th>Akcja</th></tr></thead><tbody>{items.map((app) => <tr key={app.id}>{admin && <td>{personName(app)}</td>}<td>{animalName(app)}</td><td>{prettyDate(app.submittedAt)}</td><td><StatusPill status={app.status} /></td><td><button className="button small secondary" onClick={() => onOpen(app)}>Szczegóły</button></td></tr>)}</tbody></table></div>;
}

function StatusPill({ status }) {
    const known = STATUS_LABELS[status] || (status === 'Available' ? 'Dostępne' : status === 'Unavailable' ? 'Niedostępne' : status || 'Nieznany');
    const className = status === 'Approved' || status === 'Available' ? 'green' : status === 'Rejected' || status === 'Unavailable' ? 'red' : status === 'UnderReview' ? 'blue' : 'yellow';
    return <span className={`status-pill ${className}`}>{known}</span>;
}

function StatCard({ title, value, icon }) {
    return <article className="stat-card"><span className="stat-icon">{icon}</span><div><p>{title}</p><strong>{value ?? '—'}</strong></div></article>;
}

function EmptyState({ text }) { return <div className="empty-state"><span>🐾</span><p>{text}</p></div>; }

function Field({ label, name, value, onChange, type = 'text', required = false, placeholder, min }) {
    return <div className="field"><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} min={min} value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} /></div>;    ``
}

function LoadingImage({ src, alt, className = '' }) {
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);

    return (
        <div className={`loading-image ${className}`}>
            {!loaded && !failed && (
                <div className="image-loading-message">
                    <span className="image-spinner"></span>
                    <span>Ładowanie zdjęcia...</span>
                </div>
            )}

            {failed && (
                <div className="image-loading-message">
                    Nie udało się załadować zdjęcia
                </div>
            )}

            {src && (
                <img
                    src={src}
                    alt={alt}
                    loading="lazy"
                    style={{ opacity: loaded ? 1 : 0 }}
                    onLoad={() => setLoaded(true)}
                    onError={() => setFailed(true)}
                />
            )}
        </div>
    );
}
