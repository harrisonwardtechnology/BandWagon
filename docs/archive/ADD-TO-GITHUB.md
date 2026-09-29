# Add This Scaffold To The Existing BandWagon Repo

Copy the `apps` folder from this package into the root of:

`https://github.com/harrisonwardtechnology/BandWagon`

The final repo should contain:

```
BandWagon/
  apps/
    web/
  config/
  demo/
  docs/
  ...
```

Then run from the root of your local BandWagon clone:

```bash
git add apps/web
git commit -m "Add BandWagon production web scaffold"
git push origin main
```

Do not commit a real `.env` file.
