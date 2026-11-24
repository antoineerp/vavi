// Repris de constructor-v13@5bb786e : generateur-v2/pipeline/schema-json.ts
/**
 * Le schéma JSON d'un schéma zod, pour décrire une entrée d'outil au modèle. Le schéma zod reste la seule source :
 * l'outil est décrit depuis lui, et l'entrée du modèle est relue par lui.
 */
import { z } from 'zod';

type Schema = Record<string, unknown>;

export function schemaJson(s: z.ZodTypeAny): Schema {
  const d = s._def as { typeName: string; description?: string } & Record<string, unknown>;
  const avec = (x: Schema): Schema => (s.description ? { ...x, description: s.description } : x);
  switch (d.typeName) {
    case 'ZodString': {
      const motif = (d.checks as { kind: string; regex?: RegExp }[]).find((c) => c.kind === 'regex')?.regex;
      return avec({ type: 'string', ...(motif ? { pattern: motif.source } : {}) });
    }
    case 'ZodNumber': return avec({ type: 'number' });
    case 'ZodBoolean': return avec({ type: 'boolean' });
    case 'ZodUnknown': case 'ZodAny': return avec({});
    case 'ZodLiteral': return avec({ const: d.value });
    case 'ZodEnum': return avec({ type: 'string', enum: d.values });
    case 'ZodArray': return avec({ type: 'array', items: schemaJson(d.type as z.ZodTypeAny) });
    case 'ZodRecord': return avec({ type: 'object', additionalProperties: schemaJson(d.valueType as z.ZodTypeAny) });
    case 'ZodUnion': return avec({ anyOf: (d.options as z.ZodTypeAny[]).map(schemaJson) });
    case 'ZodOptional': case 'ZodNullable': case 'ZodDefault': return avec(schemaJson(d.innerType as z.ZodTypeAny));
    case 'ZodEffects': return avec(schemaJson(d.schema as z.ZodTypeAny));
    case 'ZodObject': {
      const forme = (s as z.ZodObject<z.ZodRawShape>).shape;
      const requis = Object.entries(forme).filter(([, v]) => !v.isOptional() && (v._def as { typeName: string }).typeName !== 'ZodDefault').map(([k]) => k);
      return avec({ type: 'object', properties: Object.fromEntries(Object.entries(forme).map(([k, v]) => [k, schemaJson(v)])), required: requis });
    }
    default: throw new Error(`schemaJson : ${d.typeName} n'est pas pris en charge`);
  }
}
