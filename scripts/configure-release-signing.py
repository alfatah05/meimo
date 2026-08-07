#!/usr/bin/env python3
"""Sisipkan signingConfigs.release ke android/app/build.gradle (Cap generate ulang tiap CI)."""
from pathlib import Path
import re
import sys

p = Path("android/app/build.gradle")
if not p.exists():
    p = Path("android/app/build.gradle.kts")
    if p.exists():
        print("Kotlin DSL not supported by this helper", file=sys.stderr)
        sys.exit(1)
    print("build.gradle not found", file=sys.stderr)
    sys.exit(1)

t = p.read_text()

signing_block = """
    signingConfigs {
        release {
            def ksPropsFile = file("keystore.properties")
            def ksProps = new Properties()
            if (ksPropsFile.exists()) {
                ksProps.load(new FileInputStream(ksPropsFile))
            }
            storeFile file("meimo-release.jks")
            storePassword ksProps["STORE_PASSWORD"]
            keyAlias ksProps["KEY_ALIAS"] ?: "meimo"
            keyPassword ksProps["KEY_PASSWORD"]
        }
    }
"""

if "signingConfigs" not in t:
    if "buildTypes {" in t:
        t = t.replace("buildTypes {", signing_block + "\n    buildTypes {", 1)
    else:
        print("buildTypes block not found", file=sys.stderr)
        sys.exit(1)

if "signingConfig signingConfigs.release" not in t:
    # First release { under buildTypes
    t2, n = re.subn(
        r"(buildTypes\s*\{[\s\S]*?release\s*\{)",
        r"\1\n            signingConfig signingConfigs.release",
        t,
        count=1,
    )
    if n == 0:
        t2 = t.replace(
            "release {",
            "release {\n            signingConfig signingConfigs.release",
            1,
        )
    t = t2

p.write_text(t)
print("Configured signingConfigs.release in", p)
