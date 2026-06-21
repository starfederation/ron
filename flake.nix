{
  description = "Readable Object Notation reference corpus and editor tooling";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          manifest = builtins.fromJSON (builtins.readFile ./vscode/package.json);
          vsixName = "${manifest.name}-${manifest.version}.vsix";
          vscodeExtensionVsix = pkgs.stdenvNoCC.mkDerivation {
            pname = manifest.name;
            inherit (manifest) version;

            src = ./vscode;

            nativeBuildInputs = [
              pkgs.nodejs
              pkgs.vsce
            ];

            dontConfigure = true;
            dontBuild = true;
            doCheck = true;

            checkPhase = ''
              runHook preCheck
              node scripts/check-extension.js
              node --check extension.js
              node --check scripts/check-extension.js
              node --check scripts/package-extension.js
              runHook postCheck
            '';

            installPhase = ''
              runHook preInstall
              export HOME="$TMPDIR"
              mkdir -p "$out/share/vscode/extensions"
              vsce package --no-dependencies --out "$out/share/vscode/extensions/${vsixName}"
              runHook postInstall
            '';

            meta = {
              description = manifest.description;
              homepage = manifest.homepage;
              license = pkgs.lib.licenses.mit;
              platforms = pkgs.lib.platforms.linux ++ pkgs.lib.platforms.darwin;
            };
          };
        in
        {
          default = vscodeExtensionVsix;
          vscode-extension-vsix = vscodeExtensionVsix;
        });

      checks = forAllSystems (system: {
        vscode-extension-vsix = self.packages.${system}.vscode-extension-vsix;
      });

      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs
              pkgs.vsce
            ];
          };
        });
    };
}
