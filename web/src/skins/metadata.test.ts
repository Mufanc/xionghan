import { expect, it } from 'vitest';
import { parseSkinMetadata } from '@/skins/metadata';

it('reads the five UTF-8 fields, comments, whitespace and values containing equals signs', () => {
    expect(
        parseSkinMetadata(
            '\uFEFF# 皮肤信息\r\nid = mufanc.bamboo\r\nname=清幽竹林\r\nauthor=Mufanc\r\nversion=1.0\r\ndescription=竹林 = 清幽 # 原样保留\r\nunknown=ignored\r\n',
        ),
    ).toEqual({
        id: 'mufanc.bamboo',
        name: '清幽竹林',
        author: 'Mufanc',
        version: '1.0',
        description: '竹林 = 清幽 # 原样保留',
    });
});
it('requires identity and name but allows the other three fields to be omitted', () => {
    expect(parseSkinMetadata('id=test\nname=测试')).toEqual({ id: 'test', name: '测试' });
    expect(() => parseSkinMetadata('name=测试')).toThrow('缺少 id');
    expect(() => parseSkinMetadata('id=test\nname= ')).toThrow('缺少 name');
});
it('rejects ambiguous duplicate keys and malformed lines', () => {
    expect(() => parseSkinMetadata('id=a\nid=b\nname=测试')).toThrow('字段重复');
    expect(() => parseSkinMetadata('id=a\nname: 测试')).toThrow('第 2 行');
});

it('reads optional shared UI colors without changing identity fields', () => {
    expect(
        parseSkinMetadata(
            'id=test\nname=测试\ncolor.text=#234\ncolor.selection=#aabbcc33\ncolor.accent-text=#fff\ncolor.unknown=url(https://example.com)',
        ),
    ).toEqual({
        id: 'test',
        name: '测试',
        colors: { text: '#234', selection: '#aabbcc33', 'accent-text': '#fff' },
    });
});
it('rejects invalid or duplicate UI colors before applying styles', () => {
    for (const value of ['red', '#12', '#12345', 'url(https://example.com)', '#fff; color:red']) {
        expect(() => parseSkinMetadata(`id=test\nname=测试\ncolor.text=${value}`)).toThrow(
            '十六进制颜色',
        );
    }
    expect(() => parseSkinMetadata('id=test\nname=测试\ncolor.text=#fff\ncolor.text=#000')).toThrow(
        '字段重复',
    );
});
