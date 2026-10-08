<script setup lang="ts">
// The legal notice: who publishes the site, who hosts it, and what is done with what a
// visit leaves behind. French law asks for it (LCEN, 21 June 2004); the French version
// under the English one is the one that counts.
//
// The publisher is a private person, not a business: the law lets them leave their name
// off the page, as long as the host knows who they are (LCEN, article 6, III, 2).

definePageMeta({ layout: 'doc' })

usePage({
  title: 'Legal notice',
  description: 'Who publishes the SillySimple website, who hosts it, and what a visit leaves behind: no cookies, no statistics, no account.',
  path: '/legal/',
})

const config = useAppConfig()
const UPDATED = '8 October 2026'
const MIS_A_JOUR = '8 octobre 2026'
</script>

<template>
  <article class="legal">
    <header>
      <h1>Legal notice</h1>
      <p class="updated">Last updated {{ UPDATED }}. <a href="#fr" lang="fr">Version française</a></p>
    </header>

    <section aria-labelledby="publisher">
      <h2 id="publisher">Publisher</h2>
      <p>
        This site is published by a private person, not by a company. As French law allows a private publisher (LCEN, article 6,
        III, 2), their name is not shown here: it is known to the host below.
      </p>
      <p>Contact: <a href="mailto:contact@sillysimple.app">contact@sillysimple.app</a></p>
    </section>

    <section aria-labelledby="host">
      <h2 id="host">Host</h2>
      <p class="address">
        OVH SAS, with a share capital of €50,000,000<br />
        RCS Lille Métropole 424 761 419<br />
        2 rue Kellermann, 59100 Roubaix, France<br />
        +33 9 72 10 10 07
      </p>
    </section>

    <section aria-labelledby="data">
      <h2 id="data">What a visit leaves behind</h2>
      <p>
        This site sets no cookies, counts no visitors, and loads nothing from anyone else: its fonts and pictures come from the site
        itself. There is no account.
      </p>
      <p>
        The <NuxtLink to="/contact/">contact form</NuxtLink> sends what you write, your address and the name you give by email to
        the publisher, only to answer you. It is kept in that mailbox and nowhere else, and removed if you ask.
      </p>
      <p>
        Like any web server, the one behind this site keeps a short technical record of each request (the address it came from, the
        page and the time), to keep the site running and safe. It is used for nothing else and shared with no one.
      </p>
      <p>
        Under the GDPR you may ask what is kept about you, and have it removed, by writing to
        <a href="mailto:contact@sillysimple.app">contact@sillysimple.app</a>.
      </p>
    </section>

    <section aria-labelledby="app">
      <h2 id="app">The app</h2>
      <p>
        SillySimple runs on your computer. It has no account and no server of its own: nothing you write is sent to us.
        <NuxtLink to="/help/#what-leaves">What leaves your computer</NuxtLink> depends on the way you choose to chat, and Help says it in full.
      </p>
      <p>
        The models it downloads are made by others and come with their own terms: Gemma, the model offered by default, is Google's, under the
        Gemma Terms of Use. What a model writes is written on your computer, from your story; the publisher of this site does not see it.
      </p>
    </section>

    <section aria-labelledby="rights">
      <h2 id="rights">Names and code</h2>
      <p>
        SillySimple is an independent project. It reads SillyTavern character cards, and is not affiliated with SillyTavern, Google or
        any model maker; their names belong to them.
        <template v-if="config.repo">The app's code is free software, under the GPL-3.0 licence.</template>
      </p>
    </section>

    <section id="fr" lang="fr" class="french" aria-labelledby="fr-title">
      <h2 id="fr-title">Mentions légales</h2>
      <p class="updated">Mises à jour le {{ MIS_A_JOUR }}.</p>

      <h3>Éditeur</h3>
      <p>
        Ce site est édité par un particulier, à titre non professionnel. Comme la loi le permet (LCEN, article 6, III, 2), son nom
        n'est pas indiqué ici : il est connu de l'hébergeur.
      </p>
      <p>Contact : <a href="mailto:contact@sillysimple.app">contact@sillysimple.app</a></p>

      <h3>Hébergeur</h3>
      <p class="address">
        OVH SAS, au capital de 50 000 000 €<br />
        RCS Lille Métropole 424 761 419<br />
        2 rue Kellermann, 59100 Roubaix, France<br />
        +33 9 72 10 10 07
      </p>

      <h3>Données personnelles</h3>
      <p>
        Ce site ne dépose aucun cookie, ne mesure pas l'audience et ne charge rien depuis un autre site : ses polices et ses images
        viennent de lui-même. Il n'y a pas de compte.
      </p>
      <p>
        Le <NuxtLink to="/contact/">formulaire de contact</NuxtLink> envoie votre message, votre adresse et le nom indiqué par
        e-mail à l'éditeur, uniquement pour vous répondre. Ils sont conservés dans cette boîte mail et nulle part ailleurs, et
        supprimés sur demande.
      </p>
      <p>
        Comme tout serveur web, celui du site garde une courte trace technique de chaque requête (adresse d'origine, page, heure), pour
        son fonctionnement et sa sécurité. Elle ne sert à rien d'autre et n'est transmise à personne. Conformément au RGPD, vous pouvez
        demander ce qui est conservé à votre sujet et sa suppression en écrivant à
        <a href="mailto:contact@sillysimple.app">contact@sillysimple.app</a>.
      </p>

      <h3>L'application</h3>
      <p>
        SillySimple fonctionne sur votre ordinateur, sans compte ni serveur à elle : rien de ce que vous écrivez ne nous est envoyé. Les
        modèles qu'elle télécharge sont l'œuvre d'autres éditeurs et ont leurs propres conditions (Gemma, proposé par défaut, appartient
        à Google, sous les Gemma Terms of Use). Ce qu'un modèle écrit l'est sur votre ordinateur ; l'éditeur de ce site n'y a pas accès.
      </p>

      <h3>Marques et code</h3>
      <p>
        SillySimple est un projet indépendant, sans lien avec SillyTavern, Google ni aucun éditeur de modèles ; leurs noms leur
        appartiennent.
        <template v-if="config.repo">Le code de l'application est un logiciel libre, sous licence GPL-3.0.</template>
      </p>
    </section>
  </article>
</template>

<style scoped>
.legal {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
  max-width: 44em;
}
h1 {
  font-size: clamp(2.2rem, 1.6rem + 2.4vw, 3.4rem);
  margin: 0;
}
h2 {
  font-size: clamp(1.4rem, 1.1rem + 1.2vw, 1.9rem);
  margin: 0 0 var(--space-3);
}
h3 {
  font-size: 1.1rem;
  margin: var(--space-5) 0 var(--space-2);
}
p {
  margin: 0 0 var(--space-3);
  color: var(--panel-soft);
}
.updated {
  margin-top: var(--space-3);
  font-size: var(--text-small);
}
.address {
  color: inherit;
  line-height: 1.7;
}
.french {
  padding-top: var(--space-7);
  border-top: 1px solid var(--frame-line);
}
</style>
