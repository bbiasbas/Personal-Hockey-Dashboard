# Python + Scrapling container scrapes DailyFaceoff for goalie starts

Goalie streaming needs confirmed and likely starters, and neither the NHL API nor Yahoo provides them. So a small `scraper` service in `docker-compose.yml` runs Scrapling (Python, locked to one release and updated on purpose) and fetches DailyFaceoff's starting-goalies page once per Refresh. The Node server calls it over HTTP, the same way it calls the NHL API. That keeps Python off Windows and makes Scrapling's browser fetchers ready to use. If the scrape fails, Refresh still finishes with a warning and every goalie start is shown as projected only.

## Considered Options

- **Schedule-only goalie projections (back-to-backs + opponent strength), no scraping**: rejected. A one-game goalie stream only makes sense once there's a real starter report.
- **Python installed on Windows, spawned by the server**: rejected, it adds a runtime to install and maintain on the host.

## Consequences

- DailyFaceoff's terms of use may not allow scraping; one request per Refresh is the accepted risk.
- When DailyFaceoff changes its page layout, scraping breaks until the parser is fixed. The warning makes this visible.
