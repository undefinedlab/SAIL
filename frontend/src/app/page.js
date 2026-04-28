import {
  AboutStatsSection,
  CTASection,
  CustomCursor,
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
      <CustomCursor />
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
