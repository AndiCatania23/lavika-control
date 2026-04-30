import { redirect } from 'next/navigation';

/**
 * /content è un namespace, non una pagina. Atterraggio diretto → /content/formats.
 */
export default function ContentRoot() {
  redirect('/content/formats');
}
