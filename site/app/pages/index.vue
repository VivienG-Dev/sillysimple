<script setup lang="ts">
// The home page, top to bottom. Each part is a component of components/home.

usePage({
  title: 'SillySimple: chat with AI characters on your own computer',
  description:
    'A free, simple desktop app for AI roleplay chat. No account, no terminal: pick a story and start talking. The model runs on your own Mac or PC, or an online service writes with your key.',
  path: '/',
})

// What the app is, for search engines: free. Its installers are added when they exist.
useStructuredData({
  '@type': 'SoftwareApplication',
  name: 'SillySimple',
  applicationCategory: 'EntertainmentApplication',
  operatingSystem: 'macOS, Windows, Linux',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  license: 'https://www.gnu.org/licenses/gpl-3.0.html',
  description: 'A desktop app for AI roleplay chat with characters, which runs the model on your own computer.',
})
</script>

<template>
  <div>
    <HeroSection />
    <ComputerSection />
    <AnswersSection />
    <StoriesSection />
    <KeepsSection />
    <FirstLaunchSection />
    <PrivacySection />
    <DownloadSection />
  </div>
</template>
