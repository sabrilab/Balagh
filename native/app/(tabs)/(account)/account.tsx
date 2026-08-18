import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';
import { Badge, Button, Card, KeyValue, ListGroup, Row, Screen, Section, Segmented, useTheme } from '../../../src/components/ui';
import { meta } from '../../../src/corpus';
import { space, type } from '../../../src/theme';
import { setState, useStore } from '../../../src/store';

const REGLES = [
  'Le texte affiché provient d’une source vérifiée, jamais d’un modèle.',
  'La recherche cite des versets existants avec leur référence.',
  'Les effets s’appliquent à la voix seule, sans musique.',
  'Rien ne quitte l’appareil : ni votre voix, ni vos prises.',
];

export default function Account() {
  const t = useTheme();
  const premium = useStore((s) => s.premium);
  const mode = useStore((s) => s.mode);
  const tr = useStore((s) => s.tr);
  const src = meta.sources;

  return (
    <Screen>
      <Card style={{ gap: space.s3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s3 }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: t.label }]}>{premium ? 'Abonnement actif' : 'Formule gratuite'}</Text>
            <Text style={[type.footnote, { color: t.label3 }]}>
              {premium ? 'Toutes les acoustiques' : 'Catalogue restreint'}
            </Text>
          </View>
          <Badge label={premium ? 'Premium' : 'Gratuit'} tone={premium ? 'tint' : 'myrtle'} />
        </View>
        <Button
          label={premium ? 'Revenir à la formule gratuite' : 'Simuler l’abonnement'}
          kind={premium ? 'grey' : 'tinted'}
          onPress={() => setState({ premium: !premium })}
        />
        <Text style={[type.footnote, { color: t.label3 }]}>
          Bascule de démonstration : elle déverrouille le catalogue premium pour montrer la différence, sans aucun paiement.
        </Text>
      </Card>

      <Section title="Affichage">
        <Card style={{ gap: space.s3 }}>
          <Segmented value={mode} onChange={(v) => setState({ mode: v })}
            options={[{ value: 'tajwid' as const, label: 'Tajwid' }, { value: 'plain' as const, label: 'Noir simple' }]} />
          <Segmented value={tr} onChange={(v) => setState({ tr: v })}
            options={[
              { value: 'fr' as const, label: 'Français' },
              { value: 'en' as const, label: 'English' },
              { value: 'none' as const, label: 'Arabe seul' },
            ]} />
        </Card>
      </Section>

      <Section title="Provenance du texte">
        <Card>
          <KeyValue first k="Texte arabe" v={meta.script} />
          <KeyValue k="Édition" v={`${src.arabic.edition} · ${src.arabic.upstream}`} />
          <KeyValue k="Français" v={src.fr.translator} />
          <KeyValue k="Anglais" v={src.en.translator} />
          <KeyValue k="Vérifié" v={`${meta.verses} versets · ${meta.surahs} sourates`} />
          <KeyValue k="Empreinte" v={`${src.arabic.sha256.slice(0, 16)}…`} />
        </Card>
      </Section>

      <Section title="Règles du produit">
        <ListGroup>
          {REGLES.map((r, i) => (
            <Row key={r} first={i === 0} lead={<Ionicons name="checkmark-circle" size={22} color={t.myrtle} />}>
              <Text style={[type.subhead, { color: t.label }]}>{r}</Text>
            </Row>
          ))}
        </ListGroup>
      </Section>
    </Screen>
  );
}
