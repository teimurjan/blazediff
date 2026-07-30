import { createImageSourceUrl, type ImageSource } from "@blazediff/ui/engine";
import { useEffect, useState } from "react";

interface ResolvedByteSource {
	source: Uint8Array;
	url: string;
}

export function useImageSourceUrl(source?: ImageSource): string | undefined {
	const [resolvedBytes, setResolvedBytes] = useState<ResolvedByteSource>();

	useEffect(() => {
		if (!(source instanceof Uint8Array)) {
			setResolvedBytes(undefined);
			return;
		}

		const sourceUrl = createImageSourceUrl(source);
		setResolvedBytes({ source, url: sourceUrl.url });
		return sourceUrl.revoke;
	}, [source]);

	if (typeof source === "string") return source;
	if (resolvedBytes && resolvedBytes.source === source)
		return resolvedBytes.url;
	return undefined;
}
