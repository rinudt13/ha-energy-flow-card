# Energy Flow Card — Installation Guide

## 1  Copy the card file

Copy `energy-flow-card.js` into your Home Assistant www folder:

```
/config/www/energy-flow-card.js
```

If the `www` folder doesn't exist yet, create it.

---

## 2  Add as a Lovelace resource

In **Settings → Dashboards → Resources** (or `ui-lovelace.yaml` for YAML mode), add:

| URL                              | Type              |
|----------------------------------|-------------------|
| `/local/energy-flow-card.js`     | JavaScript Module |

Then hard-refresh your browser (Ctrl+Shift+R / Cmd+Shift+R).

---

## 3  Add the card to a dashboard

In the Lovelace UI editor choose **"Add Card → Manual"** and paste the contents of
`energy-flow-card-config.yaml`, replacing every `sensor.xxx` with your real entity IDs.

---

## 4  Sensor reference

| Config key         | What it measures               | Unit | Sign convention           |
|--------------------|-------------------------------|------|--------------------------|
| `solar_power`      | Solar generation               | W    | always positive           |
| `battery_power`    | Battery charge/discharge       | W    | + = charging, − = discharging |
| `battery_soc`      | Battery state of charge        | %    | 0 – 100                   |
| `grid_power`       | Grid import/export             | W    | + = import, − = export    |
| `house_power`      | Total home consumption         | W    | always positive           |
| `heat_pump_power`  | Heat pump consumption          | W    | always positive           |
| `ev_charger_power` | EV charger consumption         | W    | always positive           |
| `weather`          | HA weather entity              | —    | e.g. `weather.home`       |
| `sun`              | HA sun entity                  | —    | `sun.sun`                 |

---

## 5  Typical pypowerwall entity IDs

If you are using the **Powerwall Dashboard** project (pypowerwall + HA integration):

```yaml
solar_power:   sensor.powerwall_solar_now
battery_power: sensor.powerwall_battery_now
battery_soc:   sensor.powerwall_charge
grid_power:    sensor.powerwall_grid_now
house_power:   sensor.powerwall_load_now
```

---

## 6  iPad / tablet display tips

- Set the Lovelace view to **Panel mode** (single-card full-width) for the best look.
- Recommended tablet resolution: 1024 × 768 or higher.
- The card uses a 16:10 SVG viewport and scales to fill any width.

---

## 7  Features at a glance

| Feature | Details |
|---------|---------|
| **Animated flows** | Gold dots (solar), green dots (battery/home), amber (grid export), red (grid import), orange (heat pump), blue (EV) |
| **Day / Night** | Sky colour, stars, moon, window glows, porch light, and car headlights switch automatically via `sun.sun` |
| **Weather** | Icon + label + temperature from any HA weather entity |
| **Live values** | kW labels on every component, battery % bar, live power summary panel |
| **House** | Brick & stone rendering with illuminated windows at night |
| **Tesla Powerwall** | Rendered on the side wall with SOC display and status LED |
| **Heat pump** | Animated fan unit on the right side of the house |
| **EV charger + car** | Tesla Model 3 in the driveway with charging port glow |
| **Grid** | Power pole with wires, import/export direction indicator |
