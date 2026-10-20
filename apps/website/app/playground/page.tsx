import HeroHeading, { HeroAccent } from "../../components/landing/hero-heading";
import HeroSubhead from "../../components/landing/hero-subhead";
import LandingShell from "../../components/landing/shell";
import Playground from "../../components/playground/playground";

export const metadata = {
	title: "Playground",
	description:
		"Compare two images in your browser: pixel diff, region-level change classification and the MILO perceptual score, all in WebAssembly. Nothing is uploaded.",
};

export default function PlaygroundPage() {
	return (
		<LandingShell activeTab="playground" ctaLabel="GET STARTED" ctaHref="/docs">
			<section className="w-full max-w-screen-2xl mx-auto px-10 pt-16 pb-20 flex flex-col gap-10">
				<div className="flex flex-col gap-6">
					<HeroHeading>
						DIFF <HeroAccent>ANYTHING</HeroAccent>
					</HeroHeading>
					<HeroSubhead>
						Drop two images. Diff, interpret and MILO run in your browser.
						Nothing is uploaded.
					</HeroSubhead>
				</div>
				<Playground />
			</section>
		</LandingShell>
	);
}
