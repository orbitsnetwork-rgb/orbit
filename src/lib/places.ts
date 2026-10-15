import { haversine } from "@/lib/model";

export interface Place {
  city: string;
  country: string;
  lat: number;
  lng: number;
}

export const PLACES: Place[] = [
  { city: "Київ", country: "Україна", lat: 50.4501, lng: 30.5234 },
  { city: "Львів", country: "Україна", lat: 49.8397, lng: 24.0297 },
  { city: "Харків", country: "Україна", lat: 49.9935, lng: 36.2304 },
  { city: "Одеса", country: "Україна", lat: 46.4825, lng: 30.7233 },
  { city: "Дніпро", country: "Україна", lat: 48.4647, lng: 35.0462 },
  { city: "Запоріжжя", country: "Україна", lat: 47.8388, lng: 35.1396 },
  { city: "Вінниця", country: "Україна", lat: 49.2331, lng: 28.4682 },
  { city: "Івано-Франківськ", country: "Україна", lat: 48.9226, lng: 24.7111 },
  { city: "Ужгород", country: "Україна", lat: 48.6208, lng: 22.2879 },
  { city: "Чернівці", country: "Україна", lat: 48.2921, lng: 25.9358 },
  { city: "Полтава", country: "Україна", lat: 49.5883, lng: 34.5514 },
  { city: "Миколаїв", country: "Україна", lat: 46.975, lng: 31.9946 },
  { city: "Берлін", country: "Німеччина", lat: 52.52, lng: 13.405 },
  { city: "Лондон", country: "Велика Британія", lat: 51.5074, lng: -0.1278 },
  { city: "Париж", country: "Франція", lat: 48.8566, lng: 2.3522 },
  { city: "Варшава", country: "Польща", lat: 52.2297, lng: 21.0122 },
  { city: "Прага", country: "Чехія", lat: 50.0755, lng: 14.4378 },
  { city: "Відень", country: "Австрія", lat: 48.2082, lng: 16.3738 },
  { city: "Рим", country: "Італія", lat: 41.9028, lng: 12.4964 },
  { city: "Мадрид", country: "Іспанія", lat: 40.4168, lng: -3.7038 },
  { city: "Лісабон", country: "Португалія", lat: 38.7223, lng: -9.1393 },
  { city: "Амстердам", country: "Нідерланди", lat: 52.3676, lng: 4.9041 },
  { city: "Стокгольм", country: "Швеція", lat: 59.3293, lng: 18.0686 },
  { city: "Вільнюс", country: "Литва", lat: 54.6872, lng: 25.2797 },
  { city: "Тбілісі", country: "Грузія", lat: 41.7151, lng: 44.8271 },
  { city: "Стамбул", country: "Туреччина", lat: 41.0082, lng: 28.9784 },
  { city: "Нью-Йорк", country: "США", lat: 40.7128, lng: -74.006 },
  { city: "Торонто", country: "Канада", lat: 43.6532, lng: -79.3832 },
  { city: "Чикаго", country: "США", lat: 41.8781, lng: -87.6298 },
  { city: "Мехіко", country: "Мексика", lat: 19.4326, lng: -99.1332 },
  { city: "Сан-Паулу", country: "Бразилія", lat: -23.5558, lng: -46.6396 },
  { city: "Буенос-Айрес", country: "Аргентина", lat: -34.6037, lng: -58.3816 },
  { city: "Токіо", country: "Японія", lat: 35.6762, lng: 139.6503 },
  { city: "Сеул", country: "Південна Корея", lat: 37.5665, lng: 126.978 },
  { city: "Сінгапур", country: "Сінгапур", lat: 1.3521, lng: 103.8198 },
  { city: "Дубай", country: "ОАЕ", lat: 25.2048, lng: 55.2708 },
  { city: "Мумбаї", country: "Індія", lat: 19.076, lng: 72.8777 },
  { city: "Бангкок", country: "Таїланд", lat: 13.7563, lng: 100.5018 },
  { city: "Алмати", country: "Казахстан", lat: 43.222, lng: 76.8512 },
  { city: "Гонконг", country: "Гонконг", lat: 22.3193, lng: 114.1694 },
  { city: "Каїр", country: "Єгипет", lat: 30.0444, lng: 31.2357 },
  { city: "Лагос", country: "Нігерія", lat: 6.5244, lng: 3.3792 },
  { city: "Кейптаун", country: "ПАР", lat: -33.9249, lng: 18.4241 },
  { city: "Найробі", country: "Кенія", lat: -1.2921, lng: 36.8219 },
  { city: "Сідней", country: "Австралія", lat: -33.8688, lng: 151.2093 },
];

export function findPlace(city: string) {
  const key = city.trim().toLowerCase();
  return PLACES.find((place) => place.city.toLowerCase() === key);
}

export function nearestPlace(lat: number, lng: number, maxKm = 140) {
  let best: Place | null = null;
  let dist = Infinity;
  for (const place of PLACES) {
    const d = haversine({ lat, lng }, place);
    if (d < dist) {
      dist = d;
      best = place;
    }
  }
  if (!best || dist > maxKm) return null;
  return { place: best, km: dist };
}
