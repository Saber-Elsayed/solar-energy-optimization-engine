import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AUTH_TOKEN_MISSING_ERROR, authFetch, isUnauthorized } from '@/lib/api';
import { clearAuthToken } from '@/lib/auth';
type CitySuggestion = {
  name: string;
  country: string;
};

type WeatherResponse = {
  weather?: {
    city?: string;
    condition?: string;
    energy_estimate?: number;
    temperature?: number;
  };
};

const CITIES_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/cities' : 'http://127.0.0.1:8000/cities';
const OPTIMIZE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/optimize' : 'http://127.0.0.1:8000/optimize';

export default function SelectCityScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('Tel Aviv');
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [selected, setSelected] = useState<CitySuggestion | null>(null);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherResponse['weather'] | null>(null);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoadingCities(true);
        setError(null);
        const res = await fetch(`${CITIES_URL}?query=${encodeURIComponent(value)}`);
        if (!res.ok) throw new Error(`City lookup failed (${res.status})`);
        const data: unknown = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid city response');
        setSuggestions(
          data.filter(
            (item): item is CitySuggestion =>
              typeof item === 'object' &&
              item !== null &&
              'name' in item &&
              'country' in item &&
              typeof (item as { name: unknown }).name === 'string' &&
              typeof (item as { country: unknown }).country === 'string',
          ),
        );
      } catch (err) {
        setSuggestions([]);
        setError(err instanceof Error ? err.message : 'Failed to load cities');
      } finally {
        setLoadingCities(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const loadWeather = async (city: string) => {
    try {
      setLoadingWeather(true);
      setError(null);
      const res = await authFetch(OPTIMIZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, devices: [] }),
      });
      if (isUnauthorized(res)) {
        await clearAuthToken();
        router.replace('/login');
        return;
      }
      if (!res.ok) throw new Error(`Weather fetch failed (${res.status})`);
      const data = (await res.json()) as WeatherResponse;
      setWeather(data.weather ?? null);
    } catch (err) {
      if (err instanceof Error && err.message === AUTH_TOKEN_MISSING_ERROR) {
        await clearAuthToken();
        router.replace('/login');
        return;
      }
      setWeather(null);
      setError(err instanceof Error ? err.message : 'Failed to load weather');
    } finally {
      setLoadingWeather(false);
    }
  };

  const onSelect = (item: CitySuggestion) => {
    setSelected(item);
    setQuery(item.name);
    setSuggestions([]);
    void loadWeather(item.name);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">בחר עיר / Select City</ThemedText>
          <ThemedText style={styles.label}>City</ThemedText>
          <TextInput style={styles.input} value={query} onChangeText={setQuery} autoCapitalize="words" />

          {loadingCities && <ActivityIndicator size="small" color="#0a7ea4" />}
          {!!error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {suggestions.length > 0 && (
            <ThemedView style={styles.dropdown}>
              {suggestions.slice(0, 8).map((item, index) => (
                <Pressable key={`${item.name}-${item.country}-${index}`} style={({ pressed }) => [styles.option, pressed && styles.pressed]} onPress={() => onSelect(item)}>
                  <ThemedText>{item.name}</ThemedText>
                  <ThemedText style={styles.country}>{item.country}</ThemedText>
                </Pressable>
              ))}
            </ThemedView>
          )}
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Weather Data</ThemedText>
          {loadingWeather ? (
            <ActivityIndicator size="small" color="#0a7ea4" />
          ) : selected && weather ? (
            <ThemedView style={styles.weatherCard}>
              <ThemedText>City: {weather.city ?? selected.name}</ThemedText>
              <ThemedText>Temperature: {weather.temperature ?? 'N/A'}</ThemedText>
              <ThemedText>Condition: {weather.condition ?? 'N/A'}</ThemedText>
              <ThemedText>Estimated energy: {typeof weather.energy_estimate === 'number' ? weather.energy_estimate.toFixed(2) : 'N/A'}</ThemedText>
            </ThemedView>
          ) : (
            <ThemedText style={styles.muted}>Select a city to view weather details.</ThemedText>
          )}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 24 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d8e0ea',
    backgroundColor: '#f8fbff',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  label: { fontSize: 14 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c6ced8',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 15,
  },
  dropdown: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccd6e2',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e6edf5',
  },
  pressed: { opacity: 0.8 },
  country: { opacity: 0.7, fontSize: 12 },
  error: { color: '#a12222' },
  muted: { opacity: 0.7 },
  weatherCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#a9c6e7',
    backgroundColor: '#eef5ff',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
});
