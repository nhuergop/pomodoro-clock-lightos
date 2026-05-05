import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        // Oculta la barra superior ("app bar") en todas las pantallas
        headerShown: false,
        // Opcional: Asegura que el fondo de la transición de pantallas coincida con el tema
        contentStyle: { backgroundColor: 'transparent' },
      }}
    />
  );
}