# Polityka Prywatności — Radio GAMING

**Ostatnia aktualizacja:** 28 lutego 2026 r.

**Operator:** K5 Studio
**Kontakt:** DruzbinskiJakub@gmail.com  
**Strona aplikacji:** [https://radio-gaming.stream](https://radio-gaming.stream)

---

## 1. Wprowadzenie

Niniejsza Polityka Prywatności opisuje, w jaki sposób Radio GAMING („Aplikacja", „Usługa") — internetowy odtwarzacz radia gamingowego dostępny jako aplikacja webowa, aplikacja desktopowa na Windows oraz Aktywność Discord — zbiera, przetwarza i chroni dane użytkowników.

Korzystając z Aplikacji, akceptujesz praktyki opisane w niniejszym dokumencie.

---

## 2. Jakie dane zbieramy

### 2.1. Dane zbierane automatycznie (bez logowania)

- **Preferencje użytkownika** — zapisywane **wyłącznie lokalnie** (localStorage / AppData) na urządzeniu użytkownika:
  - Głośność odtwarzacza
  - Wybrana stacja radiowa
  - Tryb wyświetlania historii (siatka/lista)
  - Ustawienia wizualizacji
  - Ulubione utwory
  - Ulubione GIF-y
  - Cache okładek albumów
  - Tokeny Spotify/Giphy (wyłącznie w celu pobierania okładek i GIF-ów)

> **Ważne:** Te dane **nie są przesyłane** na nasze serwery. Pozostają wyłącznie na Twoim urządzeniu.

### 2.2. Dane zbierane przy logowaniu przez Discord

Jeśli zdecydujesz się zalogować przy użyciu konta Discord (wymagane do korzystania z czatu), pobieramy z Discord API następujące dane Twojego profilu publicznego:

| Dane | Cel |
|------|-----|
| **ID użytkownika Discord** | Identyfikacja w systemie czatu |
| **Nazwa użytkownika (username)** | Wyświetlanie w czacie i na liście online |
| **Nazwa wyświetlana (global_name)** | Wyświetlanie w czacie |
| **URL awatara** | Wyświetlanie awatara w czacie |
| **URL banera profilu** | Wyświetlanie w profilu (opcjonalne) |
| **Kolor akcentu** | Wyświetlanie w profilu (opcjonalne) |
| **Lista serwerów (guilds)** | Sprawdzanie członkostwa w obsługiwanych serwerach Discord |

Dane te są przechowywane **w pamięci serwera** (in-memory) podczas sesji i **nie są trwale zapisywane w bazie danych**. Po restarcie serwera dane sesji zostają usunięte.

### 2.3. Dane generowane przez użytkownika (czat)

Podczas korzystania z czatu stacji, zbieramy:

- **Wiadomości tekstowe** — treść wiadomości (maks. 200 znaków)
- **Obrazy** — przesłane zdjęcia/screenshoty (maks. 6 MB, format base64)
- **Reakcje emoji** — informacja o tym, kto zareagował na wiadomość
- **Niestandardowe emoji** — przesłane przez użytkowników (maks. 200 KB, dane obrazu)
- **Status online** — informacja o aktywności i aktualnie słuchanej stacji

> **Ważne:** Wiadomości czatu są przechowywane **wyłącznie w pamięci serwera** (maks. 100 wiadomości na kanał). Nie są trwale zapisywane na dysku ani w bazie danych.

---

## 3. Jak wykorzystujemy dane

Zebrane dane wykorzystujemy wyłącznie w następujących celach:

1. **Funkcjonowanie czatu** — wyświetlanie wiadomości, reakcji i listy online innym słuchaczom.
2. **System wzmianek (@mention)** — powiadamianie użytkowników, gdy ktoś ich oznaczy w czacie.
3. **Wyświetlanie okładek albumów** — wyszukiwanie i wyświetlanie okładek utworów za pośrednictwem Spotify API, iTunes API, Deezer API i YouTube Data API.
4. **Picker GIF-ów** — wyszukiwanie i wyświetlanie GIF-ów za pośrednictwem Giphy API.
5. **Discord Rich Presence** — synchronizacja aktualnie słuchanego utworu ze statusem Discord (wyłącznie w aplikacji desktopowej).
6. **Webhooks Discord** — udostępnianie utworów na wybranych serwerach Discord (tylko na wyraźne żądanie użytkownika).

---

## 4. Usługi i API zewnętrznych dostawców

Aplikacja integruje się z następującymi usługami zewnętrznymi. Korzystanie z tych usług podlega ich własnym politykom prywatności:

| Usługa | Cel | Polityka prywatności |
|--------|-----|---------------------|
| **Discord** (OAuth2, API) | Autoryzacja, dane profilu, czat, aktywności | [discord.com/privacy](https://discord.com/privacy) |
| **Spotify** (Web API) | Pobieranie okładek albumów, metadanych muzycznych | [spotify.com/legal/privacy-policy](https://www.spotify.com/legal/privacy-policy/) |
| **Apple iTunes** (Search API) | Pobieranie okładek albumów | [apple.com/legal/privacy](https://www.apple.com/legal/privacy/) |
| **Deezer** (Search API) | Pobieranie okładek albumów | [deezer.com/legal/personal-datas](https://www.deezer.com/legal/personal-datas) |
| **Giphy** (API) | Wyszukiwanie i wyświetlanie GIF-ów | [giphy.com/privacy](https://giphy.com/privacy) |
| **YouTube** (Data API) | Pobieranie okładek albumów | [policies.google.com/privacy](https://policies.google.com/privacy) |
| **Zeno FM** (Icecast) | Streaming audio, metadane stacji | [zeno.fm/privacy](https://zeno.fm/privacy) |
| **Heroku** | Hosting backendu (API) | [salesforce.com/company/privacy](https://www.salesforce.com/company/privacy/) |

---

## 5. Udostępnianie danych osobom trzecim

**Nie sprzedajemy, nie handlujemy ani nie udostępniamy Twoich danych osobowych stronom trzecim** w celach marketingowych.

Dane mogą być udostępniane wyłącznie:

- **Innym użytkownikom Aplikacji** — Twoja nazwa użytkownika Discord, awatar i wiadomości czatu są widoczne dla innych słuchaczy danej stacji.
- **Dostawcom usług zewnętrznych** — w zakresie opisanym w punkcie 4, wyłącznie w celu realizacji funkcjonalności Aplikacji.

---

## 6. Przechowywanie i bezpieczeństwo danych

### 6.1. Sesje i dane czatu

- Dane sesji i wiadomości czatu przechowywane są **wyłącznie w pamięci RAM** serwera (in-memory).
- **Nie prowadzimy trwałej bazy danych** z danymi osobowymi użytkowników.
- Sesje wygasają automatycznie po **7 dniach** od momentu logowania.
- Po restarcie serwera wszystkie sesje i wiadomości zostają usunięte.

### 6.2. Dane lokalne

- Dane zapisywane w localStorage / AppData pozostają wyłącznie na urządzeniu użytkownika.
- Użytkownik może je usunąć w dowolnym momencie (czyszczenie danych przeglądarki lub usunięcie folderu AppData aplikacji desktopowej).
- Aplikacja oferuje funkcję **eksportu i importu danych** (ulubionych, historii, ustawień).

### 6.3. Zabezpieczenia

- Komunikacja z serwerami odbywa się przez **HTTPS**.
- Tokeny sesji generowane są kryptograficznie (64 znaki, URL-safe).
- Tokeny Discord (access_token) nie są udostępniane innym użytkownikom.
- System cooldown na wiadomości czatu (2 sekundy) chroni przed spamem.

---

## 7. Twoje prawa

Masz prawo do:

1. **Dostępu** — sprawdzenia, jakie dane o Tobie przechowujemy.
2. **Usunięcia** — zażądania usunięcia swoich danych (wystarczy wylogować się z Aplikacji; sesja zostanie usunięta).
3. **Przenoszenia** — eksportu swoich danych lokalnych za pomocą wbudowanej funkcji eksportu.
4. **Wycofania zgody** — rezygnacji z OAuth Discord w dowolnym momencie przez ustawienia Discord → Autoryzowane aplikacje.

Aby dochodzić swoich praw, skontaktuj się z nami pod adresem: **DruzbinskiJakub@gmail.com**

---

## 8. Pliki cookie

Aplikacja **nie używa plików cookie** do śledzenia ani analityki. Wszystkie preferencje użytkownika przechowywane są w `localStorage` przeglądarki.

---

## 9. Dane dzieci

Aplikacja nie jest skierowana do osób poniżej 13 roku życia. Nie zbieramy świadomie danych osobowych od dzieci poniżej 13 lat. Jeśli dowiesz się, że dziecko dostarczyło nam dane osobowe, skontaktuj się z nami, a natychmiast je usuniemy.

---

## 10. Aplikacja desktopowa

Aplikacja desktopowa Radio GAMING (Windows) dodatkowo:

- Przechowuje tokeny, motywy i ulubione w dedykowanym folderze `AppData` (trwałe, lokalne przechowywanie).
- Korzysta z **Discord Rich Presence (RPC)** do synchronizacji statusu muzycznego — wymaga to komunikacji z lokalnym klientem Discord zainstalowanym na komputerze.
- **Nie zbiera żadnych danych telemetrycznych** ani analitycznych.

---

## 11. Aktywność Discord (Discord Activity)

W przypadku korzystania z Radio GAMING jako Aktywności wbudowanej w Discord:

- Autoryzacja odbywa się automatycznie za pomocą **Discord Embedded App SDK**.
- Aplikacja wymaga uprawnień `identify` i `guilds` do poprawnego działania.
- Dane przetwarzane w ramach Aktywności podlegają tym samym zasadom co opisane w niniejszej Polityce.

---

## 12. Zmiany w Polityce Prywatności

Zastrzegamy sobie prawo do aktualizacji niniejszej Polityki Prywatności. Istotne zmiany zostaną ogłoszone za pośrednictwem:

- Aktualizacji daty „Ostatnia aktualizacja" na początku dokumentu.
- Powiadomienia w Aplikacji (opcjonalnie).

Zalecamy regularne przeglądanie niniejszej Polityki.

---

## 13. Kontakt

W przypadku pytań dotyczących prywatności lub niniejszej Polityki, prosimy o kontakt:

- **E-mail:** DruzbinskiJakub@gmail.com
- **Strona:** [k5studio.dev](https://k5studio.dev)
- **GitHub:** [github.com/kubadoPL/Gaming-Radio](https://github.com/kubadoPL/Gaming-Radio)

---

*Radio GAMING — Powering Your Gaming Experience.*  
*© 2026 K5 Studio — Wszelkie prawa zastrzeżone.*
