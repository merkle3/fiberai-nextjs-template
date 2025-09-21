# Network configuration
RPC_URL = https://testnet.fiberevm.com
SENDER = 0x2557794Bf452ec0a9cB923B03b2D2fb550E17357
PRIVATE_KEY = d27798744baaa809fb04fa587023a3f80dfae7a9f6a2978d1fad89571d84d478

deploy-all:
	@echo "Deploying all contracts..."
	forge script ./script/DeployAll.s.sol:DeployAllScript -vvv \
		--fork-url $(RPC_URL) \
		--broadcast \
		--sender 0x38421c898cfC5883ddCEC1247EA3f7Ff087Dd6ca \
		--private-keys "e444a661e2860b70afce0f6f065526889d6312dec69531968eb6dada85daf40d" \
		| tee all_deployment.log
	@echo "Extracting contract addresses..."
	node extract-addresses.js all_deployment.log
	@echo "All contracts deployed and addresses updated!"