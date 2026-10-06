"use client";

import React, { ReactNode, useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { motion, Variants } from "framer-motion";
import Link from "next/link";

export default function HeroSection_05() {
  const gradientRef = useRef<HTMLDivElement>(null);
  const transitionVariants: { item: Variants } = {
    item: {
      hidden: { opacity: 0, filter: "blur(12px)", y: 12 },
      visible: {
        opacity: 1,
        filter: "blur(0px)",
        y: 0,
        transition: { type: "spring", bounce: 0.3, duration: 1.5 },
      },
    },
  };

  useEffect(() => {
    if (!gradientRef.current) return;
    gsap.fromTo(gradientRef.current, { opacity: 0, y: -30 }, {
      opacity: 1, y: 0, duration: 1.6, ease: "power3.out",
    });
  }, []);

  const variants = {
    container: { visible: { transition: { staggerChildren: 0.05, delayChildren: 0.75 } } },
    ...transitionVariants,
  };

  return (
    <div className="overflow-hidden rounded-xl p-6">
      <div className="relative w-full">
        <div ref={gradientRef} className="absolute inset-0 -z-10 max-h-[90vh] rounded-2xl transition-colors duration-700 dark:bg-black" style={{
          backgroundImage: "linear-gradient(180deg, #ffffff 0%, #FFEDD5 25%, #FFDAB9 50%, #FFB6C1 70%, #E0BBE4 85%, #F3E5F5 100%), radial-gradient(at 20% 30%, #ffffff33 0%, transparent 60%), radial-gradient(at 80% 70%, #f3e5f533 0%, transparent 70%)",
          backgroundBlendMode: "overlay, screen", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)",
        }} />
        <div className="pb-10 pt-4 text-center sm:pb-12 sm:pt-6">
          <div className="relative mx-auto max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight text-gray-800 dark:text-gray-200 sm:text-5xl md:text-6xl">Ruixen: Design Systems for the Visionary Web</h1>
            <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">Whether you&apos;re designing interfaces or building full-scale apps, our tools empower creators to move fast, stay consistent, and ship beautiful products — every time.</p>
            <AnimatedGroup variants={variants} className="mt-12 flex flex-col items-center justify-center gap-2 md:flex-row">
              <div className="rounded-[14px] border bg-foreground/10 p-0.5"><Button asChild size="lg" className="rounded-xl px-5 text-base"><span className="text-nowrap">Start Building</span></Button></div>
              <div className="rounded-[14px] border bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 p-0.5"><Button asChild size="lg" className="rounded-xl bg-white px-5 text-base text-black hover:bg-black hover:text-white"><span className="text-nowrap">Request a demo</span></Button></div>
            </AnimatedGroup>
          </div>
        </div>
        <AnimatedGroup variants={variants}>
          <div className="relative overflow-hidden px-2">
            <div aria-hidden className="absolute inset-0 z-10 bg-gradient-to-b from-transparent from-35% to-background" />
            <div className="relative mx-auto max-h-[40vh] max-w-5xl overflow-hidden rounded-t-2xl border border-b-0 border-gray-50 bg-background p-4 shadow-lg shadow-zinc-950/15 ring-1 ring-background inset-shadow-2xs dark:inset-shadow-white/20">
              <Link href="https://ruixen.com?utm_source=21st.dev&utm_medium=hero_section_05&utm_campaign=ruixen" target="_blank" rel="noreferrer">
                <Image className="relative hidden aspect-[15/8] rounded-2xl bg-background dark:block" src="https://cdn.21st.dev/assets/localized/00b99ba644f75f048140ddd20c947ffda5bac3823c31b743f15932ef747d8b23.png" alt="Ruixen app screen in dark mode" width={2700} height={1440} unoptimized />
                <Image className="relative z-[2] aspect-[15/8] rounded-2xl border border-border/25 dark:hidden" src="https://cdn.21st.dev/assets/localized/6f643e9b131c95a2d7caaab9628e9b3705e5a0aa35be8de19bada8b4e1c1c8d7.png" alt="Ruixen app screen in light mode" width={2700} height={1440} unoptimized />
              </Link>
            </div>
          </div>
        </AnimatedGroup>
      </div>
      <BrandsGrid />
    </div>
  );
}

export const BrandsGrid = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  const brands = [
    { name: "loops", logo: "https://cdn.21st.dev/assets/localized/9c5b38c2133d55566f3bbc46e4570f2a290b5271c18055233423569eb38c983a.svg" },
    { name: "pwc", logo: "https://cdn.21st.dev/assets/localized/81a4c89e6d87a2952396d6c307f46d3d5fe0e882529356a4d06d1b1b45cc6ecc.svg" },
    { name: "resend", logo: "https://cdn.21st.dev/assets/localized/8a65fb8f40a9b7fe0f289b00f5c45128895c9b3edd1ac45b44fe5e260477e587.svg" },
    { name: "udio", logo: "https://cdn.21st.dev/assets/localized/d79afe7d59976d7fa7ddffe2c75a875407dcfc02425be743f73f9b3513776b7f.svg" },
    { name: "krea", logo: "https://cdn.21st.dev/assets/localized/fe7232f2ef6e1ebba6b7e39b2bf3638a23c0e90c264d2221d44085f2ef0f4dd9.svg" },
    { name: "gopuff", logo: "https://cdn.21st.dev/assets/localized/5c9e602e7f67b998ef377a5360371a7110d9cebd5aaf495a3c269e58df2328b0.svg" },
  ];
  return <div ref={ref} className={cn("py-8", className)} {...props}><div className="mx-auto max-w-5xl px-4"><div className="mx-auto grid max-w-xs grid-cols-2 items-center md:max-w-lg md:grid-cols-3 lg:max-w-3xl lg:grid-cols-6">{brands.map((brand) => <div key={brand.name} className="flex items-center justify-center p-4"><div className="relative h-[76px] w-full"><Image src={brand.logo} alt={`${brand.name} logo`} fill unoptimized className={cn("object-contain", ["udio", "krea"].includes(brand.name) ? "invert dark:invert-0" : ["resend", "pwc"].includes(brand.name) ? "dark:brightness-0 dark:invert" : "")} /></div></div>)}</div></div></div>;
});
BrandsGrid.displayName = "BrandsGrid";

type PresetType = "fade" | "slide" | "scale" | "blur" | "blur-slide" | "zoom" | "flip" | "bounce" | "rotate" | "swing";
type AnimatedGroupProps = { children: ReactNode; className?: string; variants?: { container?: Variants; item?: Variants }; preset?: PresetType };
const defaultContainerVariants: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
const defaultItemVariants: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const presetVariants: Record<PresetType, { container: Variants; item: Variants }> = {
  fade: { container: defaultContainerVariants, item: { hidden: { opacity: 0 }, visible: { opacity: 1 } } },
  slide: { container: defaultContainerVariants, item: { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } } },
  scale: { container: defaultContainerVariants, item: { hidden: { opacity: 0, scale: 0.8 }, visible: { opacity: 1, scale: 1 } } },
  blur: { container: defaultContainerVariants, item: { hidden: { opacity: 0, filter: "blur(4px)" }, visible: { opacity: 1, filter: "blur(0px)" } } },
  "blur-slide": { container: defaultContainerVariants, item: { hidden: { opacity: 0, filter: "blur(4px)", y: 20 }, visible: { opacity: 1, filter: "blur(0px)", y: 0 } } },
  zoom: { container: defaultContainerVariants, item: { hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 20 } } } },
  flip: { container: defaultContainerVariants, item: { hidden: { opacity: 0, rotateX: -90 }, visible: { opacity: 1, rotateX: 0, transition: { type: "spring", stiffness: 300, damping: 20 } } } },
  bounce: { container: defaultContainerVariants, item: { hidden: { opacity: 0, y: -50 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 400, damping: 10 } } } },
  rotate: { container: defaultContainerVariants, item: { hidden: { opacity: 0, rotate: -180 }, visible: { opacity: 1, rotate: 0, transition: { type: "spring", stiffness: 200, damping: 15 } } } },
  swing: { container: defaultContainerVariants, item: { hidden: { opacity: 0, rotate: -10 }, visible: { opacity: 1, rotate: 0, transition: { type: "spring", stiffness: 300, damping: 8 } } } },
};

function AnimatedGroup({ children, className, variants, preset }: AnimatedGroupProps) {
  const selected = preset ? presetVariants[preset] : { container: defaultContainerVariants, item: defaultItemVariants };
  return <motion.div initial="hidden" animate="visible" variants={variants?.container || selected.container} className={cn(className)}>{React.Children.map(children, (child, index) => <motion.div key={index} variants={variants?.item || selected.item}>{child}</motion.div>)}</motion.div>;
}

export { AnimatedGroup };
