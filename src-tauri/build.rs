fn main() {
    tauri_build::build();

    // Paths for the C++ core dependencies (FFmpeg via vcpkg, NDI SDK vendored).
    let vcpkg_root = std::path::Path::new(r"D:\vcpkg\installed\x64-windows-static-md");
    let ffmpeg_include = vcpkg_root.join("include");
    let ffmpeg_lib = vcpkg_root.join("lib");

    let ndi_root = std::path::Path::new(r"C:\Program Files\NDI\NDI 6 SDK");
    let ndi_include = ndi_root.join("Include");
    let ndi_lib = ndi_root.join("Lib").join("x64");

    if !ffmpeg_include.exists() || !ffmpeg_lib.exists() || !ndi_include.exists() || !ndi_lib.exists() {
        panic!("FFmpeg or NDI SDK paths not found; check src-tauri/build.rs");
    }

    cxx_build::bridge("src/native/bridge.rs")
        .file("cpp/src/video_engine.cpp")
        .file("cpp/src/ndi_output.cpp")
        .include("cpp/include")
        .include(&ffmpeg_include)
        .include(&ndi_include)
        .flag_if_supported("/std:c++17")
        .flag_if_supported("-std=c++17")
        // Always optimize the C++ core (JPEG encode is the hot path) even for
        // dev builds, so debug runs behave like the shipped release.
        .opt_level(3)
        .compile("proworshipcast_core");

    println!("cargo:rerun-if-changed=src/native/bridge.rs");
    println!("cargo:rerun-if-changed=cpp/include/core.h");
    println!("cargo:rerun-if-changed=cpp/src/video_engine.cpp");
    println!("cargo:rerun-if-changed=cpp/src/ndi_output.cpp");

    // ---- FFmpeg static libs (vcpkg x64-windows-static-md) ----
    println!("cargo:rustc-link-search=native={}", ffmpeg_lib.display());
    // MSVC resolves symbols in command-line order; list dependents before deps.
    for lib in [
        "avdevice",
        "avfilter",
        "avformat",
        "avcodec",
        "avutil",
        "swresample",
        "swscale",
    ] {
        println!("cargo:rustc-link-lib=static={}", lib);
    }
    // libjpeg-turbo (SIMD JPEG encoder replacing FFmpeg's slow MJPEG encoder).
    println!("cargo:rustc-link-lib=static=jpeg");
    // System import libs required by FFmpeg's .pc link closures.
    for lib in [
        "mfuuid",
        "ole32",
        "strmiids",
        "user32",
        "psapi",
        "uuid",
        "oleaut32",
        "shlwapi",
        "gdi32",
        "vfw32",
        "secur32",
        "ncrypt",
        "crypt32",
        "ws2_32",
        "bcrypt",
    ] {
        println!("cargo:rustc-link-lib=dylib={}", lib);
    }

    // ---- NDI import library ----
    println!("cargo:rustc-link-search=native={}", ndi_lib.display());
    println!("cargo:rustc-link-lib=dylib=Processing.NDI.Lib.x64");

    // The NDI DLL is imported at load time; make sure it sits next to the
    // executable (dev builds otherwise fail with STATUS_DLL_NOT_FOUND).
    if let Ok(out_dir) = std::env::var("OUT_DIR") {
        let target_dir = std::path::Path::new(&out_dir)
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf());
        if let Some(dir) = target_dir {
            let _ = std::fs::copy(
                ndi_root.join("Bin").join("x64").join("Processing.NDI.Lib.x64.dll"),
                dir.join("Processing.NDI.Lib.x64.dll"),
            );
        }
    }
}
