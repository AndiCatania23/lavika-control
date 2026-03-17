import { redirect } from 'next/navigation';

// Sessioni è stata spostata nella pagina Utenti (tab "Sessioni")
export default function SessionsPage() {
  redirect('/users');
}
