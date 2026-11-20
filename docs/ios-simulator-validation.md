# HF Coach — validación del simulador iOS

- Estado: **PENDING_VALIDATION**
- Rama: fix/ios-safari-and-simulator
- Fuente: HF-Coach-Android-Source.zip
- Plataforma de runner: macos-15
- Xcode / Capacitor / build: pendientes de nueva ejecución.
- Última referencia histórica: commit a9080da67597fbb628241ab3cb3177adc86e2219, donde el simulador compiló, instaló y abrió la app. Esa prueba no certifica esta nueva rama.

Esta validación se limita a compilación, instalación y lanzamiento en iPhone Simulator. No demuestra instalación en iPhone físico ni valida cámara, selector de archivos, subida real de videos, deep links, almacenamiento seguro o TestFlight.

Para instalar en un iPhone físico se requiere una compilación de dispositivo firmada y un método de distribución (desarrollo/ad hoc o TestFlight).
