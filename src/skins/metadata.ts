export interface SkinMetadata {
    id: string;
    name: string;
    author?: string;
    version?: string;
    description?: string;
}

const fields = new Set(['id', 'name', 'author', 'version', 'description']);

export function parseSkinMetadata(text: string): SkinMetadata {
    const values: Partial<SkinMetadata> = {};

    for (const [index, source] of text
        .replace(/^\uFEFF/, '')
        .split(/\r\n|\n|\r/)
        .entries()) {
        const line = source.trim();

        if (!line || line.startsWith('#')) continue;

        const separator = line.indexOf('=');

        if (separator < 0) throw new Error(`skin.properties 第 ${index + 1} 行应为 key=value`);

        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();

        if (!fields.has(key)) continue;
        if (Object.hasOwn(values, key)) throw new Error(`skin.properties 字段重复：${key}`);

        values[key as keyof SkinMetadata] = value;
    }

    if (!values.id) throw new Error('skin.properties 缺少 id');
    if (!values.name) throw new Error('skin.properties 缺少 name');

    return { ...values, id: values.id, name: values.name };
}
