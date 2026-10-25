const skinColorNames = [
    'text',
    'muted',
    'border',
    'surface',
    'accent',
    'accent-text',
    'hover',
    'selection',
] as const;

type SkinColor = (typeof skinColorNames)[number];

export interface SkinMetadata {
    id: string;
    name: string;
    author?: string;
    version?: string;
    description?: string;
    colors?: Partial<Record<SkinColor, string>>;
}

const fields = new Set(['id', 'name', 'author', 'version', 'description']);

export function parseSkinMetadata(text: string): SkinMetadata {
    const values: Partial<SkinMetadata> = {};
    const colors: Partial<Record<SkinColor, string>> = {};

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

        if (key.startsWith('color.') && skinColorNames.some((name) => key === `color.${name}`)) {
            const name = key.slice(6) as SkinColor;

            if (Object.hasOwn(colors, name)) throw new Error(`skin.properties 字段重复：${key}`);
            if (!/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value))
                throw new Error(`skin.properties ${key} 必须是十六进制颜色`);

            colors[name] = value;
            continue;
        }

        if (!fields.has(key)) continue;
        if (Object.hasOwn(values, key)) throw new Error(`skin.properties 字段重复：${key}`);

        values[key as 'id' | 'name' | 'author' | 'version' | 'description'] = value;
    }

    if (!values.id) throw new Error('skin.properties 缺少 id');
    if (!values.name) throw new Error('skin.properties 缺少 name');

    return {
        ...values,
        id: values.id,
        name: values.name,
        ...(Object.keys(colors).length ? { colors } : {}),
    };
}
