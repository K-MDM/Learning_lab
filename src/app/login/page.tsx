export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
  const {error}=await searchParams;
  const configured=Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY);
  return <main><p className="brand">KEEEL · COMPANY CONSOLE</p><h1>Your language lab, managed.</h1>
    <p className="muted">Manage device licences and publish content with your company account.</p>
    <section className="panel" aria-labelledby="sign-in"><h2 id="sign-in">Staff sign in</h2>
      {!configured&&<p className="notice">Company sign-in is awaiting backend configuration.</p>}
      {error&&<p role="alert">Sign-in could not be completed. Check your credentials and company access, then try again.</p>}
      <form action="/api/staff/login" method="post">
        <label htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254}/>
        <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024}/>
        <button disabled={!configured}>Sign in</button>
      </form>
    </section><p className="muted">Learning records and recordings remain on licensed devices.</p></main>;
}
