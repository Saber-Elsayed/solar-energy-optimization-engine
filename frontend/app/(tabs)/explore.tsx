import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, TextInput, View } from 'react-native';

import { OnBgScreen } from '@/components/on-bg-screen';
import { ThemedText } from '@/components/themed-text';
import { onBgStyles } from '@/styles/on-bg';

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
      const res = await fetch(OPTIMIZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, devices: [] }),
      });
      if (!res.ok) throw new Error(`Weather fetch failed (${res.status})`);
      const data = (await res.json()) as WeatherResponse;
      setWeather(data.weather ?? null);
    } catch (err) {
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
    <OnBgScreen keyboardShouldPersistTaps="always">
      <View style={onBgStyles.onBgPanel}>
        <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
          בחר עיר / Select City
        </ThemedText>
        <ThemedText lightColor="#fff" style={onBgStyles.onBgLabel}>
          City
        </ThemedText>
        <TextInput
          style={onBgStyles.onBgInput}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
          placeholderTextColor="rgba(255, 255, 255, 0.55)"
        />

        {loadingCities ? <ActivityIndicator size="small" color="#ffffff" /> : null}
        {!!error ? <ThemedText lightColor="#fecaca" style={onBgStyles.onBgErrorText}>{error}</ThemedText> : null}

        {suggestions.length > 0 && (
          <View style={onBgStyles.onBgDropdown}>
            {suggestions.slice(0, 8).map((item, index) => (
              <Pressable
                key={`${item.name}-${item.country}-${index}`}
                style={({ pressed }) => [onBgStyles.onBgCityRow, pressed && onBgStyles.buttonPressed]}
                onPress={() => onSelect(item)}
              >
                <ThemedText lightColor="#fff" style={onBgStyles.onBgBody}>
                  {item.name}
                </ThemedText>
                <ThemedText lightColor="#fff" style={onBgStyles.onBgMuted}>
                  {item.country}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={onBgStyles.onBgPanel}>
        <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
          Weather Data
        </ThemedText>
        {loadingWeather ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : selected && weather ? (
          <View style={onBgStyles.onBgPanelInner}>
            <ThemedText lightColor="#fff" style={onBgStyles.onBgBody}>
              City: {weather.city ?? selected.name}
            </ThemedText>
            <ThemedText lightColor="#fff" style={onBgStyles.onBgBody}>
              Temperature: {weather.temperature ?? 'N/A'}
            </ThemedText>
            <ThemedText lightColor="#fff" style={onBgStyles.onBgBody}>
              Condition: {weather.condition ?? 'N/A'}
            </ThemedText>
            <ThemedText lightColor="#fff" style={onBgStyles.onBgBody}>
              Estimated energy:{' '}
              {typeof weather.energy_estimate === 'number' ? weather.energy_estimate.toFixed(2) : 'N/A'}
            </ThemedText>
          </View>
        ) : (
          <ThemedText lightColor="#fff" style={onBgStyles.onBgMuted}>
            Select a city to view weather details.
          </ThemedText>
        )}
      </View>
    </OnBgScreen>
  );
}
