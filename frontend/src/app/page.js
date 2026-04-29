import {
  AboutStatsSection,
  CTASection,
  HeroSection,
  ManifestIntroSection,
  ManifestoSection,
  Navbar,
  ProjectsSection,
  ServicesSection,
  SiteFooter,
} from "@/components/landing";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <ManifestIntroSection />
        <ServicesSection />
        <AboutStatsSection />
        <ManifestoSection />
        <ProjectsSection />
        <CTASection />
      </main>
      <SiteFooter />
    </>
  );
}
