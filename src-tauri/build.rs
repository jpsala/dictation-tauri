fn main() {
    #[cfg(windows)]
    {
        // Cargo test binaries on Windows do not get Tauri's app manifest, so any
        // target that links Tauri/tao/wry can load comctl32 v5 and fail before
        // test startup with STATUS_ENTRYPOINT_NOT_FOUND for TaskDialogIndirect.
        // embed-manifest's default manifest requests Common Controls v6.
        embed_manifest::embed_manifest(embed_manifest::new_manifest("dev.jpsala.dictation-tauri"))
            .expect("unable to embed Windows common-controls manifest");

        if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("gnu") {
            let manifest_object = std::path::PathBuf::from(
                std::env::var_os("OUT_DIR").expect("OUT_DIR should be set by Cargo"),
            )
            .join("embed-manifest.o");
            println!("cargo:rustc-link-arg={}", manifest_object.display());
        }
    }

    println!("cargo:rerun-if-changed=build.rs");
    tauri_build::build()
}
