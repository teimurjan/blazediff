"use client";

import { useEffect, useState } from "react";

/** An object URL for `blob`, revoked when the blob changes or on unmount. */
export function useObjectUrl(blob: Blob | null): string | null {
	const [url, setUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!blob) {
			setUrl(null);
			return;
		}
		const next = URL.createObjectURL(blob);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [blob]);

	return url;
}
