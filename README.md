## Development

Run the complete status check, frontend validation, browser bundle build, wheel
build, and editable Python install from the repository root:

```powershell
.\build.ps1
```

Use `-Clean` to remove generated package output before rebuilding:

```powershell
.\build.ps1 -Clean
```

Start the Streamlit app. The default behavior rebuilds first:

```powershell
.\run.ps1
```

To run without rebuilding, or to choose another port:

```powershell
.\run.ps1 -NoBuild -Port 8510
```
