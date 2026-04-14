import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

/**
 * Backend device shape (POST body). No `id` — the API only needs these fields.
 */
export type ApiDevicePayload = {
  name: string;
  power: number;
  duration: number;
  priority: number;
  essential: boolean;
  start_time: string;
  end_time: string;
};

/** Full shape returned by the updated backend /optimize response. */
export type CannotRunItem = {
  device: ApiDevicePayload;
  reason: string;
};

export type ScenarioResult = {
  name: string;
  can_run: ApiDevicePayload[];
  cannot_run: CannotRunItem[];
  remaining_energy: number;
};

export type ForecastHourResult = {
  hour: string;
  can_run: ApiDevicePayload[];
  remaining_energy: number;
};

export type OptimizeApiResponse = {
  scenarios: ScenarioResult[];
  forecast: ForecastHourResult[];
  alerts: string[];
  weather: {
    city: string;
    condition: string;
    energy_estimate: number;
  };
};

/**
 * FastAPI `/optimize` (port 8000).
 * Fix: On Android emulator, `127.0.0.1` is the emulator itself, not your PC — use 10.0.2.2.
 * iOS Simulator / Expo Web on same machine: 127.0.0.1 is correct.
 * Physical device: replace with your computer's LAN IP (e.g. 192.168.x.x).
 */
const OPTIMIZE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000/optimize'
    : 'http://127.0.0.1:8000/optimize';
const CITIES_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000/cities'
    : 'http://127.0.0.1:8000/cities';

type CitySuggestion = {
  name: string;
  country: string;
};

/** One saved device row in the UI list (includes local `id` for React keys). */
export type DeviceRow = {
  id: string;
  name: string;
  power_kw: number;
  duration_minutes: number;
  priority: number;
  mandatory: boolean;
  start_time: string;
  end_time: string;
};

function toApiDevice(row: DeviceRow): ApiDevicePayload {
  return {
    name: row.name,
    power: row.power_kw,
    duration: row.duration_minutes,
    priority: row.priority,
    essential: row.mandatory,
    start_time: row.start_time,
    end_time: row.end_time,
  };
}

/** One line per API device — used under Active / Rejected lists. */
function ApiDeviceRow({ device, index }: { device: ApiDevicePayload; index: number }) {
  return (
    <ThemedView style={styles.deviceRow}>
      <ThemedText type="defaultSemiBold" style={styles.deviceName}>
        {index + 1}. {device.name}
      </ThemedText>
      <ThemedText style={styles.deviceMeta}>
        {device.power} kWh · priority {device.priority} · {device.start_time}-{device.end_time}
      </ThemedText>
    </ThemedView>
  );
}

/**
 * Device entry + optimization home screen.
 * Form fields are controlled inputs; the list is the accumulated `devices` state.
 */
export default function DeviceOptimizerScreen() {
  // --- State -----------------------------------------------------------------
  // `devices`: list of devices the user has added (shown below the form).
  const [devices, setDevices] = useState<DeviceRow[]>([]);

  // Form fields: separate state per input so each keystroke/toggle re-renders correctly.
  // Numbers are kept as strings while typing; we parse them when adding a device.
  const [name, setName] = useState('');
  const [powerKw, setPowerKw] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [priority, setPriority] = useState('3');
  const [mandatory, setMandatory] = useState(false);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('18:00');
  const [city, setCity] = useState('Tel Aviv');
  const [selectedCity, setSelectedCity] = useState<CitySuggestion | null>({ name: 'Tel Aviv', country: '' });
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);

  // Keep API result in state (multiple named optimization scenarios).
  const [scenarios, setScenarios] = useState<OptimizeApiResponse | null>(null);

  // Debug: confirm list updates in Metro / Xcode logs (helps when UI “looks” stuck).
  useEffect(() => {
    console.log('[Devices] current devices array', devices);
  }, [devices]);

  // City autocomplete with debounce:
  // - Wait briefly after typing before calling /cities.
  // - Hide list when query is short/empty.
  // - Show loading + error state for better UX.
  useEffect(() => {
    const query = city.trim();
    if (query.length < 2) {
      setCitySuggestions([]);
      setCityLoading(false);
      setCityError(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setCityLoading(true);
        setCityError(null);
        const response = await fetch(`${CITIES_URL}?query=${encodeURIComponent(query)}`);
        if (!response.ok) {
          throw new Error(`City lookup failed (${response.status})`);
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data)) {
          throw new Error('City lookup returned invalid format');
        }
        const suggestions = data
          .filter(
            (item): item is CitySuggestion =>
              typeof item === 'object' &&
              item !== null &&
              'name' in item &&
              'country' in item &&
              typeof (item as { name: unknown }).name === 'string' &&
              typeof (item as { country: unknown }).country === 'string'
          )
          .slice(0, 8);
        setCitySuggestions(suggestions);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load cities';
        setCitySuggestions([]);
        setCityError(message);
      } finally {
        setCityLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [city]);

  // --- Adding a device -------------------------------------------------------
  // Validates, appends to `devices`, then resets the form so the user can enter another.
  const handleAddDevice = () => {
    const trimmedName = name.trim();
    // Normalize locale decimals (e.g. "7,2" → "7.2") so parseFloat is reliable.
    const power = parseFloat(powerKw.replace(',', '.'));
    const duration = parseInt(durationMinutes, 10);
    const prio = parseInt(priority, 10);

    if (!trimmedName) {
      console.warn('[AddDevice] blocked: empty name');
      Alert.alert('Validation', 'Please enter a device name.');
      return;
    }
    if (Number.isNaN(power) || power <= 0) {
      console.warn('[AddDevice] blocked: invalid power_kw', powerKw);
      Alert.alert('Validation', 'Power (kW) must be a positive number.');
      return;
    }
    if (Number.isNaN(duration) || duration <= 0) {
      console.warn('[AddDevice] blocked: invalid duration_minutes', durationMinutes);
      Alert.alert('Validation', 'Duration must be a positive whole number of minutes.');
      return;
    }
    if (Number.isNaN(prio) || prio < 1 || prio > 5) {
      console.warn('[AddDevice] blocked: invalid priority', priority);
      Alert.alert('Validation', 'Priority must be between 1 and 5.');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      Alert.alert('Validation', 'Start/End time must be in HH:MM format.');
      return;
    }

    const newDevice: DeviceRow = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: trimmedName,
      power_kw: power,
      duration_minutes: duration,
      priority: prio,
      mandatory,
      start_time: startTime,
      end_time: endTime,
    };

    console.log('[AddDevice] adding device', newDevice);
    setDevices((prev) => [...prev, newDevice]);

    // Clear inputs after a successful add (fresh row for the next device).
    setName('');
    setPowerKw('');
    setDurationMinutes('');
    setPriority('3');
    setMandatory(false);
    setStartTime('08:00');
    setEndTime('18:00');
  };

  /**
   * POST `{ devices }` to the FastAPI `/optimize` endpoint.
   *
   * How `fetch` works (high level):
   * - `fetch(url, options)` starts an HTTP request and returns a **Promise** that
   *   resolves to a **Response** object (status, headers, body stream).
   * - The Promise resolves when headers arrive; it does **not** throw on HTTP
   *   error status (4xx/5xx) — check `response.ok` or `response.status`.
   * - `await response.json()` reads the body and parses JSON (also async).
   * - Network failures, DNS errors, etc. reject the Promise — use `try/catch`.
   */
  const handleOptimize = async () => {
    // Log current list right before building the body (catches stale UI vs state confusion).
    console.log('[Optimize] before request — devices in state', devices);

    const payload = { city: city.trim(), devices: devices.map(toApiDevice) };

    try {
      // Log before the network call (URL + JSON body shape the server will receive).
      console.log('[Optimize] Sending request', { url: OPTIMIZE_URL, body: payload });

      const response = await fetch(OPTIMIZE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // Log as soon as the HTTP response headers/status are available.
      console.log('[Optimize] Response received', {
        status: response.status,
        ok: response.ok,
        url: response.url,
      });

      const rawText = await response.text();
      let data: unknown = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error(`Server did not return JSON (status ${response.status}). Body: ${rawText.slice(0, 200)}`);
      }

      if (!response.ok) {
        const detail =
          typeof data === 'object' && data !== null && 'detail' in data
            ? JSON.stringify((data as { detail: unknown }).detail)
            : rawText.slice(0, 300);
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }

      if (
        typeof data !== 'object' ||
        data === null ||
        !('scenarios' in data) ||
        !Array.isArray((data as { scenarios: unknown }).scenarios) ||
        !('forecast' in data) ||
        !Array.isArray((data as { forecast: unknown }).forecast) ||
        !('alerts' in data) ||
        !Array.isArray((data as { alerts: unknown }).alerts) ||
        !('weather' in data)
      ) {
        console.warn('Optimize response missing required fields; clearing results.', data);
        setScenarios(null);
      } else {
        setScenarios(data as OptimizeApiResponse);
      }

      // Log full parsed JSON after a successful read/parse (includes scenarios, telemetry, etc.).
      console.log('[Optimize] Parsed response body', data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setScenarios(null);
      Alert.alert('Optimize failed', message);
      console.error('[Optimize] request failed — full error:', err);
      console.error('[Optimize] message:', message);
    }
  };

  const handleSelectCity = (item: CitySuggestion) => {
    // Save selected city and fill the input.
    setSelectedCity(item);
    setCity(item.name);
    setCitySuggestions([]);
    setCityError(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        // Fix: default "handled" often eats the first tap on Add/Optimize while the keyboard
        // is open (tap dismisses keyboard instead of firing onPress). "always" runs the button.
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag">
        <ThemedView style={styles.section}>
          <ThemedText type="title">Devices</ThemedText>
          <ThemedText style={styles.hint}>
            Add devices, then Optimize (POST {OPTIMIZE_URL}). Use your PC LAN IP on a physical device.
          </ThemedText>
        </ThemedView>

        {scenarios && (
          <ThemedView style={styles.section}>
            <ThemedView style={styles.weatherCard}>
              <ThemedText type="defaultSemiBold" style={styles.weatherTitle}>
                Weather
              </ThemedText>
              <ThemedText style={styles.weatherText}>City: {scenarios.weather.city}</ThemedText>
              <ThemedText style={styles.weatherText}>Condition: {scenarios.weather.condition}</ThemedText>
              <ThemedText style={styles.weatherText}>
                Estimated energy: {scenarios.weather.energy_estimate.toFixed(2)} kWh
              </ThemedText>
            </ThemedView>
          </ThemedView>
        )}

        {scenarios && scenarios.alerts.length > 0 && (
          <ThemedView style={styles.section}>
            <ThemedView style={styles.alertsCard}>
              <ThemedText type="defaultSemiBold" style={styles.alertsTitle}>
                Alerts
              </ThemedText>
              {scenarios.alerts.map((alert, idx) => (
                <ThemedView key={`alert-${idx}`} style={styles.alertRow}>
                  <ThemedText style={styles.alertIcon}>[!]</ThemedText>
                  <ThemedText style={styles.alertText}>{alert}</ThemedText>
                </ThemedView>
              ))}
            </ThemedView>
          </ThemedView>
        )}

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">New device</ThemedText>

          <ThemedText style={styles.label}>City</ThemedText>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={(text) => {
              setCity(text);
              setSelectedCity(null);
            }}
            placeholder="e.g. Tel Aviv"
            placeholderTextColor="#888"
            autoCapitalize="words"
          />
          {cityLoading && (
            <ThemedView style={styles.cityStatusRow}>
              <ActivityIndicator size="small" color="#0a7ea4" />
              <ThemedText style={styles.cityStatusText}>Searching cities...</ThemedText>
            </ThemedView>
          )}
          {!!cityError && <ThemedText style={styles.cityErrorText}>{cityError}</ThemedText>}
          {citySuggestions.length > 0 && (
            <ThemedView style={styles.cityDropdown}>
              {citySuggestions.map((item, idx) => (
                <Pressable
                  key={`city-${item.name}-${item.country}-${idx}`}
                  onPress={() => handleSelectCity(item)}
                  style={({ pressed }) => [styles.cityOption, pressed && styles.buttonPressed]}>
                  <ThemedText style={styles.cityOptionName}>{item.name}</ThemedText>
                  <ThemedText style={styles.cityOptionCountry}>{item.country}</ThemedText>
                </Pressable>
              ))}
            </ThemedView>
          )}
          {selectedCity && (
            <ThemedText style={styles.selectedCityText}>
              Selected city: {selectedCity.name}
              {selectedCity.country ? ` (${selectedCity.country})` : ''}
            </ThemedText>
          )}

          <ThemedText style={styles.label}>Name</ThemedText>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. EV charger"
            placeholderTextColor="#888"
            autoCapitalize="words"
          />

          <ThemedText style={styles.label}>Power (kW)</ThemedText>
          <TextInput
            style={styles.input}
            value={powerKw}
            onChangeText={setPowerKw}
            placeholder="e.g. 7.2"
            placeholderTextColor="#888"
            keyboardType="decimal-pad"
          />

          <ThemedText style={styles.label}>Duration (minutes)</ThemedText>
          <TextInput
            style={styles.input}
            value={durationMinutes}
            onChangeText={setDurationMinutes}
            placeholder="e.g. 120"
            placeholderTextColor="#888"
            keyboardType="number-pad"
          />

          <ThemedText style={styles.label}>Priority (1–5)</ThemedText>
          <TextInput
            style={styles.input}
            value={priority}
            onChangeText={setPriority}
            placeholder="1 to 5"
            placeholderTextColor="#888"
            keyboardType="number-pad"
            maxLength={1}
          />

          <ThemedText style={styles.label}>Start time (HH:MM)</ThemedText>
          <TextInput
            style={styles.input}
            value={startTime}
            onChangeText={setStartTime}
            placeholder="08:00"
            placeholderTextColor="#888"
            autoCapitalize="none"
          />

          <ThemedText style={styles.label}>End time (HH:MM)</ThemedText>
          <TextInput
            style={styles.input}
            value={endTime}
            onChangeText={setEndTime}
            placeholder="18:00"
            placeholderTextColor="#888"
            autoCapitalize="none"
          />

          <ThemedView style={styles.switchRow}>
            <ThemedText style={styles.label}>Mandatory</ThemedText>
            <Switch value={mandatory} onValueChange={setMandatory} />
          </ThemedView>

          <Pressable
            accessibilityRole="button"
            android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={handleAddDevice}>
            <Text style={styles.buttonText}>Add Device</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.buttonSecondary, pressed && styles.buttonPressed]}
            onPress={() => {
              void handleOptimize();
            }}>
            <Text style={styles.buttonSecondaryText}>Optimize</Text>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Device list ({devices.length})</ThemedText>
          {devices.length === 0 ? (
            <ThemedText style={styles.empty}>No devices yet. Add one above.</ThemedText>
          ) : (
            devices.map((d) => (
              <ThemedView key={d.id} style={styles.card}>
                <ThemedText type="defaultSemiBold">
                  {d.name} — {d.power_kw} kW
                </ThemedText>
                <ThemedText>
                  {d.duration_minutes} min · priority {d.priority} ·{' '}
                  {d.mandatory ? 'mandatory' : 'optional'} · {d.start_time}-{d.end_time}
                </ThemedText>
              </ThemedView>
            ))
          )}
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Optimization results</ThemedText>
          {!scenarios ? (
            <ThemedText style={styles.empty}>Run Optimize after a successful request to see results here.</ThemedText>
          ) : (
            scenarios.scenarios.map((scenario, scenarioIndex) => (
              <ThemedView key={`scenario-${scenarioIndex}-${scenario.name}`} style={styles.scenarioCard}>
                <ThemedText type="defaultSemiBold" style={styles.scenarioTitle}>
                  {scenario.name}
                </ThemedText>
                <ThemedText style={styles.hint}>
                  Remaining energy: {scenario.remaining_energy.toFixed(2)} kWh
                </ThemedText>

                <ThemedView style={[styles.subCard, styles.canRunCard]}>
                  <ThemedText type="defaultSemiBold" style={[styles.subCardTitle, styles.canRunTitle]}>
                    Can Run ({scenario.can_run.length})
                  </ThemedText>
                  {scenario.can_run.length === 0 ? (
                    <ThemedText style={styles.listEmpty}>None</ThemedText>
                  ) : (
                    <ThemedView style={styles.deviceList}>
                      {scenario.can_run.map((d, i) => (
                        <ApiDeviceRow key={`can-run-${scenarioIndex}-${d.name}-${i}`} device={d} index={i} />
                      ))}
                    </ThemedView>
                  )}
                </ThemedView>

                <ThemedView style={[styles.subCard, styles.cannotRunCard]}>
                  <ThemedText type="defaultSemiBold" style={[styles.subCardTitle, styles.cannotRunTitle]}>
                    Cannot Run ({scenario.cannot_run.length})
                  </ThemedText>
                  {scenario.cannot_run.length === 0 ? (
                    <ThemedText style={styles.listEmpty}>None</ThemedText>
                  ) : (
                    <ThemedView style={styles.deviceList}>
                      {scenario.cannot_run.map((item, i) => (
                        <ThemedView key={`cannot-run-${scenarioIndex}-${item.device.name}-${i}`} style={styles.deviceRow}>
                          <ApiDeviceRow device={item.device} index={i} />
                          <ThemedText style={styles.reasonText}>Reason: {item.reason}</ThemedText>
                        </ThemedView>
                      ))}
                    </ThemedView>
                  )}
                </ThemedView>
              </ThemedView>
            ))
          )}
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">12-Hour Forecast</ThemedText>
          {!scenarios ? (
            <ThemedText style={styles.empty}>Forecast appears after a successful Optimize call.</ThemedText>
          ) : (
            scenarios.forecast.map((hourResult, hourIndex) => (
              <ThemedView key={`forecast-${hourIndex}-${hourResult.hour}`} style={styles.forecastCard}>
                <ThemedText type="defaultSemiBold" style={styles.forecastHour}>
                  {hourResult.hour}
                </ThemedText>
                <ThemedText style={styles.hint}>
                  Remaining energy: {hourResult.remaining_energy.toFixed(2)} kWh
                </ThemedText>
                {hourResult.can_run.length === 0 ? (
                  <ThemedText style={styles.listEmpty}>No devices can run in this hour.</ThemedText>
                ) : (
                  <ThemedView style={styles.deviceList}>
                    {hourResult.can_run.map((device, deviceIndex) => (
                      <ApiDeviceRow
                        key={`forecast-device-${hourIndex}-${device.name}-${deviceIndex}`}
                        device={device}
                        index={deviceIndex}
                      />
                    ))}
                  </ThemedView>
                )}
              </ThemedView>
            ))
          )}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  hint: {
    opacity: 0.8,
    marginTop: 4,
  },
  label: {
    marginTop: 8,
    fontSize: 14,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#f9f9f9',
  },
  cityStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  cityStatusText: {
    fontSize: 13,
    opacity: 0.8,
  },
  cityErrorText: {
    marginTop: 6,
    fontSize: 13,
    color: '#a12222',
  },
  cityDropdown: {
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cfd6e4',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  cityOption: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e7ebf2',
  },
  cityOptionName: {
    fontSize: 14,
  },
  cityOptionCountry: {
    fontSize: 12,
    opacity: 0.75,
  },
  selectedCityText: {
    marginTop: 6,
    fontSize: 13,
    color: '#1f3b63',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingVertical: 4,
  },
  button: {
    marginTop: 16,
    backgroundColor: '#0a7ea4',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonSecondary: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#0a7ea4',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondaryText: {
    color: '#0a7ea4',
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    opacity: 0.7,
    marginTop: 8,
  },
  card: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    gap: 4,
  },
  scenarioCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c8c8c8',
    backgroundColor: '#f6f8f9',
    gap: 6,
  },
  scenarioTitle: {
    fontSize: 17,
    marginBottom: 2,
  },
  forecastCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c8d4e8',
    backgroundColor: '#f4f8ff',
    gap: 4,
  },
  forecastHour: {
    fontSize: 16,
  },
  weatherCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#9ec5f8',
    backgroundColor: '#eef5ff',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  weatherTitle: {
    color: '#1a4f8a',
    fontSize: 16,
  },
  weatherText: {
    color: '#1f3b63',
    fontSize: 14,
  },
  alertsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#f0b27a',
    backgroundColor: '#fff4e8',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  alertsTitle: {
    color: '#a84300',
    fontSize: 16,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 2,
  },
  alertIcon: {
    color: '#b14d00',
    fontSize: 14,
    marginTop: 1,
  },
  alertText: {
    color: '#8f2d0a',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  subCard: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  subCardTitle: {
    fontSize: 15,
    marginBottom: 4,
  },
  canRunCard: {
    borderColor: '#9ad3a6',
    backgroundColor: '#edf9ef',
  },
  cannotRunCard: {
    borderColor: '#e1a0a0',
    backgroundColor: '#fdf0f0',
  },
  canRunTitle: {
    color: '#1f7a34',
  },
  cannotRunTitle: {
    color: '#a12222',
  },
  subsectionLabel: {
    marginTop: 10,
    fontSize: 14,
    opacity: 0.85,
    fontWeight: '600',
  },
  deviceList: {
    marginTop: 4,
    gap: 0,
  },
  deviceRow: {
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  reasonText: {
    color: '#a12222',
    fontSize: 13,
    marginTop: 4,
  },
  deviceName: {
    fontSize: 15,
  },
  deviceMeta: {
    fontSize: 14,
    marginTop: 2,
    opacity: 0.9,
    lineHeight: 20,
  },
  listEmpty: {
    fontSize: 14,
    opacity: 0.55,
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: 2,
  },
});
