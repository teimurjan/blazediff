"use server";

import { compileMdx } from "nextra/compile";
import { MDXRemote } from "nextra/mdx-remote";

interface RemoteSourceCodeProps {
	url: string;
	language?: string;
}

const RemoteSourceCode = async ({ url, language }: RemoteSourceCodeProps) => {
	const response = await fetch(url);
	if (!response.ok) {
		return null;
	}
	const text = await response.text();
	const code = text.trim();

	const compiledSource = code
		? await compileMdx(
				`\`\`\`${language} filename="${url}"\n${code}\`\`\``.trim(),
			)
		: undefined;

	if (!compiledSource) {
		return null;
	}

	return <MDXRemote compiledSource={compiledSource} />;
};

export default RemoteSourceCode;
