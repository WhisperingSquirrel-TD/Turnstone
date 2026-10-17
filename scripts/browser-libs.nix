{ pkgs ? import <nixpkgs> {} }:
pkgs.buildEnv {
  name = "party-game-browser-runtime";
  paths = [
    (pkgs.lib.getLib pkgs.libgbm)
    (pkgs.lib.getLib pkgs.libglvnd)
    (pkgs.lib.getLib pkgs.mesa)
    pkgs.stdenv.cc.cc.lib
    (pkgs.lib.getLib (pkgs.libjpeg_turbo.override { enableJpeg8 = true; }))
    pkgs.gst_all_1.gst-libav
    (pkgs.lib.getLib pkgs.x264)
  ];
  pathsToLink = [ "/lib" "/share/glvnd/egl_vendor.d" ];
}
