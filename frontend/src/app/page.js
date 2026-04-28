import {
  AboutStatsSection,
  CTASection,
  HeroSection,
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
        <ManifestoSection />
        <ServicesSection />
        <ProjectsSection />
        <AboutStatsSection />
        <CTASection />
      </main>
      <SiteFooter />
    </>
  );
}
