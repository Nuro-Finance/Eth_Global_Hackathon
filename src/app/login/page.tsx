import { redirect } from 'next/navigation';

export default function LoginPage() {
  // Hard-redirect to /en/login as a primary fix for the 404 on port 2800
  redirect('/en/login');
}
