import {
	AUTHOR_NAME,
	AUTHOR_URL,
	SAME_AS,
	SITE_DESCRIPTION,
	SITE_NAME,
	SITE_URL,
} from "../../utils/site";
import { FAQ_ITEMS } from "./faq";

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

const GRAPH = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "Organization",
			"@id": ORGANIZATION_ID,
			name: SITE_NAME,
			url: SITE_URL,
			logo: `${SITE_URL}/logo.png`,
			description: SITE_DESCRIPTION,
			sameAs: SAME_AS,
			founder: {
				"@type": "Person",
				name: AUTHOR_NAME,
				url: AUTHOR_URL,
			},
		},
		{
			"@type": "FAQPage",
			"@id": `${SITE_URL}/#faq`,
			// Mirrors the questions rendered by <LandingFaq />; structured data must
			// not claim anything the visitor cannot read on the page.
			mainEntity: FAQ_ITEMS.map((item) => ({
				"@type": "Question",
				name: item.question,
				acceptedAnswer: {
					"@type": "Answer",
					text: item.answer,
				},
			})),
			publisher: { "@id": ORGANIZATION_ID },
		},
	],
};

// Escaped so a future "</script>" in any answer cannot close the tag early.
const SERIALIZED = JSON.stringify(GRAPH).replace(/</g, "\\u003c");

export default function StructuredData() {
	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has to be inlined as raw JSON
			dangerouslySetInnerHTML={{ __html: SERIALIZED }}
		/>
	);
}
